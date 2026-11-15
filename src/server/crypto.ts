import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "./env";

/** Ma hoa AES-256-GCM (API Key NCC). Dinh dang: v1:<iv>:<tag>:<cipher> (base64url). Khoa o CRED_ENC_KEY, khong o CSDL. */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", env.credEncKey, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(":");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, enc] = blob.split(":");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("Dữ liệu mã hóa không hợp lệ.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", env.credEncKey, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64url")), decipher.final()]).toString("utf8");
}

/** Bam HMAC co pepper cho token/OTP/thiet bi/phien (CSDL khong bao gio giu gia tri goc). */
export function hashToken(value: string): string {
  return crypto.createHmac("sha256", env.tokenPepper).update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Ma 6 so (crypto.randomInt, khong dung Math.random). */
export function randomOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 11);
}

export async function verifyPassword(pw: string, hash: string | null): Promise<boolean> {
  // So sanh gia de khong lo "email khong ton tai" qua thoi gian phan hoi.
  return bcrypt.compare(pw, hash ?? "$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinvali");
}

/** Mat khau: >= 10 ky tu, co chu va so (huong dan don gian cho nguoi khong ranh may tinh). */
export function checkPasswordStrength(pw: string): "ok" | "short" | "weak" {
  if (pw.length < 10) return "short";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "weak";
  return "ok";
}
