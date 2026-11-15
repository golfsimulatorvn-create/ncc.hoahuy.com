import crypto from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";
import { safeEqual } from "./crypto";
import type { OtpPurpose } from "@prisma/client";

/**
 * Cookie "dang cho nhap ma xac thuc": luu {userId, muc dich, het han} KY HMAC (khong phai phien dang nhap).
 * Ma OTP chi co tac dung khi di kem cookie nay, nen ke khac khong the nhap ma cho tai khoan cua nguoi khac.
 */
export const PENDING_COOKIE = "hh_ncc_pending";
type Pending = { u: number; p: OtpPurpose; exp: number };

const sign = (payload: string) => crypto.createHmac("sha256", env.tokenPepper).update(`pending:${payload}`).digest("base64url");

export async function setPending(userId: number, purpose: OtpPurpose): Promise<void> {
  const exp = Date.now() + (env.otpMinutes + 5) * 60_000;
  const payload = Buffer.from(JSON.stringify({ u: userId, p: purpose, exp } satisfies Pending)).toString("base64url");
  (await cookies()).set(PENDING_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: (env.otpMinutes + 5) * 60,
  });
}

export async function readPending(): Promise<Pending | null> {
  const raw = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!raw) return null;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac || !safeEqual(mac, sign(payload))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Pending;
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

export async function clearPending(): Promise<void> {
  (await cookies()).delete(PENDING_COOKIE);
}
