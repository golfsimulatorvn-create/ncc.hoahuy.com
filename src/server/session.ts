import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { PortalRole } from "@prisma/client";
import { db } from "./db";
import { env } from "./env";
import { hashToken, randomToken } from "./crypto";
import { assertCan, can, homeFor, type Perm } from "./permissions";

export const SESSION_COOKIE = "hh_ncc_session";
export const DEVICE_COOKIE = "hh_ncc_device";

export type PortalUser = {
  id: number;
  credentialId: number;
  crmSupplierId: number;
  supplierName: string;
  supplierCode: string;
  email: string;
  displayName: string;
  role: PortalRole;
  locale: string;
};

const cookieBase = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" };

export async function clientInfo() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

/** Tao phien moi, dat cookie. Gia tri cookie la token ngau nhien; CSDL chi giu BAM cua no. */
export async function createSession(userId: number): Promise<void> {
  const token = randomToken(32);
  const { ip, userAgent } = await clientInfo();
  const now = Date.now();
  await db.session.create({
    data: { id: hashToken(token), userId, ip, userAgent, expiresAt: new Date(now + env.sessionMaxHours * 3600_000), lastSeenAt: new Date(now) },
  });
  (await cookies()).set(SESSION_COOKIE, token, { ...cookieBase, maxAge: env.sessionMaxHours * 3600 });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.updateMany({ where: { id: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
  jar.delete(SESSION_COOKIE);
}

/** Huy MOI phien (va tuy chon moi thiet bi) cua 1 nguoi dung — dung khi khoa tai khoan, doi vai tro, doi mat khau. */
export async function revokeUserSessions(userId: number, alsoDevices = false): Promise<void> {
  const now = new Date();
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  if (alsoDevices) await db.deviceToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
}

export async function setDeviceCookie(userId: number): Promise<void> {
  const token = randomToken(32);
  await db.deviceToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + env.deviceDays * 86_400_000) } });
  (await cookies()).set(DEVICE_COOKIE, token, { ...cookieBase, maxAge: env.deviceDays * 86_400 });
}

/** Thiet bi nay da duoc xac thuc cho nguoi dung nay chua (cookie hop le, chua het han / thu hoi). */
export async function isKnownDevice(userId: number): Promise<boolean> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token) return false;
  const row = await db.deviceToken.findUnique({ where: { tokenHash: hashToken(token) } });
  return !!row && row.userId === userId && !row.revokedAt && row.expiresAt > new Date();
}

/** Nguoi dung hien tai hoac null: kiem phien con han (het han tuyet doi + khong hoat dong), tai khoan ACTIVE, NCC chua tam ngung. */
export async function getSessionUser(): Promise<PortalUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { include: { credential: true } } },
  });
  const now = Date.now();
  if (!s || s.revokedAt || s.expiresAt.getTime() <= now) return null;
  if (now - s.lastSeenAt.getTime() > env.sessionIdleMinutes * 60_000) return null;
  const u = s.user;
  if (u.deletedAt || u.status !== "ACTIVE" || !u.credential.active) return null;
  if (now - s.lastSeenAt.getTime() > 60_000) {
    await db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date(now) } }).catch(() => {});
  }
  return {
    id: u.id, credentialId: u.credentialId, crmSupplierId: u.credential.crmSupplierId, supplierName: u.credential.supplierName,
    supplierCode: u.credential.supplierCode, email: u.email, displayName: u.displayName, role: u.role, locale: u.locale,
  };
}

/** Trang/Server Action: bat buoc dang nhap, neu khong chuyen ve /dang-nhap. */
export async function requireUser(): Promise<PortalUser> {
  const u = await getSessionUser();
  if (!u) redirect("/dang-nhap");
  return u;
}

/** Bat buoc dang nhap + co quyen; thieu quyen chuyen ve trang dau cua vai tro. */
export async function requirePerm(perm: Perm): Promise<PortalUser> {
  const u = await requireUser();
  if (!can(u.role, perm)) redirect(homeFor(u.role));
  return u;
}

export { assertCan };
