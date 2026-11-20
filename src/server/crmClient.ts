import crypto from "node:crypto";
import { db } from "./db";
import { decryptSecret } from "./crypto";
import { env } from "./env";
import { buildSignedHeaders } from "./crmSign";
import type { PortalRole } from "@prisma/client";

/**
 * Goi CRM Hoa Huy thay mat 1 nguoi dung cua NCC (specs/054, T032). Trinh duyet cua NCC KHONG bao gio cham toi CRM
 * va khong bao gio thay API Key: khoa duoc giai ma trong bo nho cua may chu cong, gan vao request roi bo.
 * Thao tac ghi KHONG tu thu lai ngam (nguoi dung tuong da xong ma thuc te chua) — thu lai chi do nguoi dung bam,
 * kem CUNG Idempotency-Key de CRM khong ghi trung.
 */
export type CrmActor = { id: number; credentialId: number; displayName: string; role: PortalRole };

export class CrmError extends Error {
  status: number;
  code: string | null;
  /** Phan JSON con lai CRM tra kem loi (vd assignedCount + codes cua SUBVENDOR_ASSIGNED, specs/068). */
  data: Record<string, unknown> | null;
  constructor(message: string, status: number, code: string | null = null, data: Record<string, unknown> | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/** CRM khong phan hoi / ket noi loi / qua thoi gian (khac loi nghiep vu). */
export class CrmUnavailableError extends CrmError {
  constructor() {
    super("Không kết nối được tới Hoa Huy. Dữ liệu bạn vừa nhập vẫn còn trên màn hình, vui lòng thử lại sau ít phút.", 503, "CRM_UNAVAILABLE");
  }
}

export type CrmRequest = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string; // vd "/api/supplier/orders" (khong gom host)
  query?: Record<string, string | number | null | undefined>;
  json?: unknown;
  form?: FormData;
  idempotencyKey?: string;
  timeoutMs?: number;
};

async function loadApiKey(credentialId: number): Promise<string> {
  const cred = await db.supplierCredential.findUnique({ where: { id: credentialId } });
  if (!cred || !cred.active || !cred.apiKeyEnc) {
    throw new CrmError("Tài khoản nhà cung cấp tạm ngừng. Vui lòng liên hệ Hoa Huy.", 403, "SUPPLIER_SUSPENDED");
  }
  return decryptSecret(cred.apiKeyEnc);
}

function qs(query?: CrmRequest["query"]): string {
  if (!query) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v != null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Goi CRM, tra Response tho (dung cho tai tep). Nem CrmError neu mang loi. */
export async function crmFetchRaw(actor: CrmActor, req: CrmRequest, requestId = crypto.randomUUID()): Promise<Response> {
  const apiKey = await loadApiKey(actor.credentialId);
  const method = req.method ?? "GET";
  const pathWithQuery = req.path + qs(req.query);

  let body: BodyInit | undefined;
  let signBytes: Uint8Array | null = null;
  const headers: Record<string, string> = { authorization: `Bearer ${apiKey}` };
  if (req.form) {
    // Ma hoa multipart mot lan de bam dung byte se gui.
    const tmp = new Request("http://x", { method: "POST", body: req.form });
    headers["content-type"] = tmp.headers.get("content-type")!;
    signBytes = new Uint8Array(await tmp.arrayBuffer());
    body = signBytes as unknown as BodyInit;
  } else if (req.json !== undefined) {
    const text = JSON.stringify(req.json);
    headers["content-type"] = "application/json";
    signBytes = new TextEncoder().encode(text);
    body = text;
  }
  Object.assign(
    headers,
    buildSignedHeaders({
      secret: env.crmHmacSecret, method, pathWithQuery, body: signBytes,
      user: { id: String(actor.id), name: actor.displayName, role: actor.role }, requestId, idempotencyKey: req.idempotencyKey,
    }),
  );

  try {
    return await fetch(env.crmBaseUrl + pathWithQuery, {
      method, headers, body, cache: "no-store", signal: AbortSignal.timeout(req.timeoutMs ?? 20_000),
    });
  } catch {
    throw new CrmUnavailableError();
  }
}

/** Goi CRM va doc JSON `{ ok, data, message, code }`. Loi nghiep vu -> CrmError (giu status + code de giao dien dich). */
export async function crmCall<T = unknown>(actor: CrmActor, req: CrmRequest): Promise<T> {
  return (await crmCallFull<T>(actor, req)).data as T;
}

/** Nhu crmCall nhung tra ca khoa cung cap voi `data` (vd `subVendorHistory` o /item-costs/history, specs/068). */
export async function crmCallFull<T = unknown, X extends Record<string, unknown> = Record<string, unknown>>(actor: CrmActor, req: CrmRequest): Promise<{ data: T } & X> {
  const res = await crmFetchRaw(actor, req);
  const json = (await res.json().catch(() => null)) as ({ ok?: boolean; data?: T; message?: string; code?: string } & Record<string, unknown>) | null;
  if (!res.ok || !json || json.ok === false) {
    throw new CrmError(json?.message ?? "Lỗi từ máy chủ Hoa Huy.", res.status, json?.code ?? null, json ?? null);
  }
  return json as { data: T } & X;
}
