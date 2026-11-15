import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "./db";
import { env } from "./env";
import { safeEqual } from "./crypto";
import { UserAdminError } from "./userAdmin";

/**
 * Xac thuc admin-api (CRM -> cong), HMAC-SHA256 bi mat PORTAL_ADMIN_HMAC_SECRET (khac bi mat cong -> CRM).
 * Chuoi ky: METHOD \n PATH?QUERY \n sha256(body) \n ts \n nonce \n userId \n userName(da encodeURIComponent).
 * Chong phat lai bang bang UsedNonce (khong dung lai nonce trong 10 phut), lech gio toi da 5 phut.
 */
export function adminSignaturePayload(p: { method: string; pathWithQuery: string; bodyHash: string; ts: string; nonce: string; user: string; userName: string }): string {
  return [p.method.toUpperCase(), p.pathWithQuery, p.bodyHash, p.ts, p.nonce, p.user, p.userName].join("\n");
}

export function signAdmin(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export type CrmActorInfo = { userId: string; userName: string };

export async function verifyAdminRequest(req: NextRequest): Promise<CrmActorInfo> {
  const sig = req.headers.get("x-crm-sig") ?? "";
  const ts = req.headers.get("x-crm-ts") ?? "";
  const nonce = req.headers.get("x-crm-nonce") ?? "";
  const user = req.headers.get("x-crm-user") ?? "";
  const userName = req.headers.get("x-crm-user-name") ?? "";
  if (!sig || !ts || !nonce || !user) throw new AdminAuthError(401, "Thiếu chữ ký.");
  const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!Number.isFinite(skew) || skew > 300) throw new AdminAuthError(403, "Chữ ký hết hạn.");
  const bytes = Buffer.from(await req.clone().arrayBuffer());
  const url = new URL(req.url);
  const expected = signAdmin(
    env.adminHmacSecret,
    adminSignaturePayload({ method: req.method, pathWithQuery: url.pathname + url.search, bodyHash: crypto.createHash("sha256").update(bytes).digest("hex"), ts, nonce, user, userName }),
  );
  if (!/^[0-9a-f]+$/i.test(sig) || !safeEqual(expected, sig.toLowerCase())) throw new AdminAuthError(403, "Chữ ký không hợp lệ.");
  try {
    await db.usedNonce.create({ data: { nonce } });
  } catch {
    throw new AdminAuthError(403, "Yêu cầu bị gửi lặp.");
  }
  await db.usedNonce.deleteMany({ where: { seenAt: { lt: new Date(Date.now() - 20 * 60_000) } } }).catch(() => {});
  return { userId: user, userName: decodeURIComponent(userName) };
}

export class AdminAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Boc 1 handler admin-api: xac thuc roi bat loi chung (mot khuon JSON). */
export async function withAdminApi(req: NextRequest, handler: (actor: CrmActorInfo) => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler(await verifyAdminRequest(req));
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ ok: false, message: e.message }, { status: e.status });
    if (e instanceof UserAdminError) {
      const status = e.code === "notFound" ? 404 : e.code === "invalid" ? 422 : 409;
      return NextResponse.json({ ok: false, message: e.message, code: e.code }, { status });
    }
    console.error("[admin-api]", e);
    return NextResponse.json({ ok: false, message: "Lỗi hệ thống." }, { status: 500 });
  }
}
