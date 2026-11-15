import crypto from "node:crypto";

/**
 * Chu ky HMAC cong -> CRM (hop dong: specs/054 contracts/crm-supplier-api.md). HAM THUAN, khong phu thuoc moi truong,
 * de CRM co the nhap file nay vao kiem thu va dam bao hai ben ky/kiem GIONG HET nhau.
 */
export function portalSignaturePayload(p: {
  method: string; pathWithQuery: string; bodyHash: string; ts: string; nonce: string; user: string; userName: string; role: string;
}): string {
  return [p.method.toUpperCase(), p.pathWithQuery, p.bodyHash, p.ts, p.nonce, p.user, p.userName, p.role].join("\n");
}

export function signPortalPayload(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export type SignInput = {
  secret: string;
  method: string;
  pathWithQuery: string;
  body: Uint8Array | string | null;
  user: { id: string; name: string; role: string };
  requestId: string;
  idempotencyKey?: string | null;
  now?: Date;
  nonce?: string;
};

/** Tao bo header ky cho 1 request goi CRM (ten nguoi dung da encodeURIComponent, bam theo BYTE cua body). */
export function buildSignedHeaders(i: SignInput): Record<string, string> {
  const ts = String(Math.floor((i.now ?? new Date()).getTime() / 1000));
  const nonce = i.nonce ?? crypto.randomUUID();
  const userName = encodeURIComponent(i.user.name);
  const bytes = i.body == null ? Buffer.alloc(0) : typeof i.body === "string" ? Buffer.from(i.body, "utf8") : Buffer.from(i.body);
  const bodyHash = crypto.createHash("sha256").update(bytes).digest("hex");
  const sig = signPortalPayload(
    i.secret,
    portalSignaturePayload({ method: i.method, pathWithQuery: i.pathWithQuery, bodyHash, ts, nonce, user: i.user.id, userName, role: i.user.role }),
  );
  const h: Record<string, string> = {
    "x-portal-user": i.user.id,
    "x-portal-user-name": userName,
    "x-portal-role": i.user.role,
    "x-portal-ts": ts,
    "x-portal-nonce": nonce,
    "x-portal-sig": sig,
    "x-request-id": i.requestId,
  };
  if (i.idempotencyKey) h["idempotency-key"] = i.idempotencyKey;
  return h;
}
