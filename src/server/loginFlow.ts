import { db } from "./db";
import { env } from "./env";
import { hashToken, hashPassword, randomOtp, randomToken, safeEqual, verifyPassword } from "./crypto";
import { sendMail } from "./mailer";
import { writePortalAudit } from "./audit";
import { isLocale, type Locale } from "@/i18n/config";
import type { OtpPurpose, SupplierUser, SupplierCredential } from "@prisma/client";

/**
 * Logic dang nhap / kich hoat / dat lai mat khau cua Cong NCC (specs/054 research.md R4) — KHONG dung cookie o day
 * (cookie o actions). Quy tac (nguoi dung chot 15/11/2026): ma OTP email CHI khi (1) kich hoat tai khoan,
 * (2) dang nhap tu thiet bi MOI, (3) dat lai mat khau. Khoa tam sau MAX_FAILED_LOGINS lan sai.
 */
const loc = (u: { locale: string }): Locale => (isLocale(u.locale) ? u.locale : "vi");

type UserWithCred = SupplierUser & { credential: SupplierCredential };

export type PasswordResult =
  | { status: "ok"; user: UserWithCred }
  | { status: "bad" }
  | { status: "locked"; until: Date }
  | { status: "choose"; options: { credentialId: number; supplierName: string }[] };

/** Chong do mat khau theo email (ca email khong ton tai, khong lo ton tai hay khong) va theo IP. */
async function recentFailures(email: string, ip: string | null): Promise<{ byEmail: number; byIp: number }> {
  const since = new Date(Date.now() - env.lockMinutes * 60_000);
  const [byEmail, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { email, success: false, at: { gte: since } } }),
    ip ? db.loginAttempt.count({ where: { ip, success: false, at: { gte: since } } }) : Promise.resolve(0),
  ]);
  return { byEmail, byIp };
}

export async function attemptPassword(input: { email: string; password: string; credentialId?: number | null; ip: string | null }): Promise<PasswordResult> {
  const email = input.email.trim().toLowerCase();
  const fails = await recentFailures(email, input.ip);
  if (fails.byEmail >= env.maxFailedLogins || fails.byIp >= env.maxFailedLogins * 6) {
    return { status: "locked", until: new Date(Date.now() + env.lockMinutes * 60_000) };
  }

  const candidates = await db.supplierUser.findMany({
    where: { email, deletedAt: null, ...(input.credentialId ? { credentialId: input.credentialId } : {}) },
    include: { credential: true },
  });
  // Luon bam 1 lan de thoi gian phan hoi khong lo email co ton tai hay khong.
  const matches: UserWithCred[] = [];
  for (const u of candidates.length ? candidates : [null]) {
    const ok = await verifyPassword(input.password, u?.passwordHash ?? null);
    if (u && ok && u.status !== "INVITED" && u.passwordHash) matches.push(u);
  }

  const fail = async () => {
    await db.loginAttempt.create({ data: { email, ip: input.ip, success: false } });
    for (const u of candidates) {
      const n = u.failedLoginCount + 1;
      const lock = n >= env.maxFailedLogins;
      await db.supplierUser.update({ where: { id: u.id }, data: { failedLoginCount: n, ...(lock ? { lockedUntil: new Date(Date.now() + env.lockMinutes * 60_000) } : {}) } });
      if (lock) await notifyLocked(u);
    }
    return { status: "bad" } as const;
  };

  if (matches.length === 0) return fail();
  const now = new Date();
  const usable = matches.filter((u) => u.status === "ACTIVE" && u.credential.active && (!u.lockedUntil || u.lockedUntil <= now));
  if (usable.length === 0) {
    const lockedUntil = matches.map((u) => u.lockedUntil).find((d) => d && d > now);
    // Tai khoan bi khoa/tam ngung: khong cho vao, khong tiet lo ly do chi tiet qua phan hoi khac nhau.
    return lockedUntil ? { status: "locked", until: lockedUntil } : fail();
  }
  if (usable.length > 1) {
    return { status: "choose", options: usable.map((u) => ({ credentialId: u.credentialId, supplierName: u.credential.supplierName })) };
  }
  const user = usable[0];
  await db.supplierUser.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  await db.loginAttempt.create({ data: { email, ip: input.ip, success: true } });
  return { status: "ok", user };
}

async function notifyLocked(u: UserWithCred) {
  await sendMail("lockedUser", loc(u), u.email, { name: u.displayName, minutes: String(env.lockMinutes) }).catch(() => {});
  const admins = await db.supplierUser.findMany({ where: { credentialId: u.credentialId, role: "ADMIN", status: "ACTIVE", deletedAt: null, id: { not: u.id } } });
  for (const a of admins) {
    await sendMail("lockedAdmin", loc(a), a.email, { name: a.displayName, user: u.displayName, email: u.email, minutes: String(env.lockMinutes) }).catch(() => {});
  }
  await writePortalAudit({ userId: u.id, supplierId: u.credential.crmSupplierId, role: u.role, action: "LOGIN_LOCKED" });
}

/** Tao + gui OTP 6 so; huy ma cu cung muc dich. */
export async function issueOtp(user: SupplierUser, purpose: OtpPurpose): Promise<void> {
  await db.otpCode.updateMany({ where: { userId: user.id, purpose, usedAt: null }, data: { usedAt: new Date() } });
  const code = randomOtp();
  await db.otpCode.create({ data: { userId: user.id, purpose, codeHash: hashToken(`${user.id}:${purpose}:${code}`), expiresAt: new Date(Date.now() + env.otpMinutes * 60_000) } });
  await sendMail("otp", loc(user), user.email, { name: user.displayName, code, minutes: String(env.otpMinutes) });
}

export type OtpResult = "ok" | "bad" | "expired" | "tooMany";

export async function verifyOtp(userId: number, purpose: OtpPurpose, code: string): Promise<OtpResult> {
  const row = await db.otpCode.findFirst({ where: { userId, purpose, usedAt: null }, orderBy: { id: "desc" } });
  if (!row) return "expired";
  if (row.expiresAt <= new Date()) return "expired";
  if (row.attempts >= 5) return "tooMany";
  const ok = safeEqual(row.codeHash, hashToken(`${userId}:${purpose}:${code.trim()}`));
  if (!ok) {
    await db.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return "bad";
  }
  await db.otpCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return "ok";
}

/** Email bao "dang nhap tu thiet bi moi" cho chinh nguoi dung; la tai khoan Quan tri thi bao them cac Quan tri khac cua NCC. */
export async function notifyNewDevice(u: UserWithCred, ip: string | null): Promise<void> {
  const vars = { name: u.displayName, email: u.email, ip: ip ?? "?", time: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC" };
  await sendMail("newDevice", loc(u), u.email, vars).catch(() => {});
  if (u.role === "ADMIN") {
    const admins = await db.supplierUser.findMany({ where: { credentialId: u.credentialId, role: "ADMIN", status: "ACTIVE", deletedAt: null, id: { not: u.id } } });
    for (const a of admins) await sendMail("newDevice", loc(a), a.email, { ...vars, name: a.displayName }).catch(() => {});
  }
}

// ---- Loi moi / dat lai mat khau ----

export async function createInvite(user: SupplierUser, purpose: "ACTIVATE" | "RESET"): Promise<string> {
  await db.invite.updateMany({ where: { userId: user.id, purpose, usedAt: null }, data: { usedAt: new Date() } });
  const token = randomToken(32);
  await db.invite.create({ data: { userId: user.id, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + env.inviteHours * 3600_000) } });
  return token;
}

export async function sendInviteMail(user: SupplierUser, supplierName: string, token: string): Promise<void> {
  await sendMail("invite", loc(user), user.email, { name: user.displayName, supplier: supplierName, link: `${env.appUrl}/moi/${token}`, hours: String(env.inviteHours) });
}

export async function sendResetMail(user: SupplierUser, token: string): Promise<void> {
  await sendMail("reset", loc(user), user.email, { name: user.displayName, link: `${env.appUrl}/dat-lai/${token}`, hours: String(env.inviteHours) });
}

/** Tra ve nguoi dung neu token con hieu luc, dung 1 lan, dung muc dich; KHONG danh dau da dung (dung o buoc dat mat khau). */
export async function peekInvite(token: string, purpose: "ACTIVATE" | "RESET") {
  const inv = await db.invite.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { credential: true } } } });
  if (!inv || inv.usedAt || inv.purpose !== purpose || inv.expiresAt <= new Date() || inv.user.deletedAt || !inv.user.credential.active) return null;
  if (purpose === "ACTIVATE" && inv.user.status !== "INVITED") return null;
  if (purpose === "RESET" && inv.user.status === "LOCKED") return null;
  return inv;
}

/** Dat mat khau tu loi moi / lien ket dat lai: danh dau token da dung, luu mat khau; buoc OTP ke tiep hoan tat. */
export async function consumeInviteWithPassword(token: string, purpose: "ACTIVATE" | "RESET", password: string) {
  const inv = await peekInvite(token, purpose);
  if (!inv) return null;
  await db.$transaction([
    db.invite.update({ where: { id: inv.id }, data: { usedAt: new Date() } }),
    db.supplierUser.update({ where: { id: inv.userId }, data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null } }),
  ]);
  return inv.user;
}

/** Quen mat khau: luon "da gui" (khong lo email co ton tai); chi gui cho tai khoan ACTIVE. */
export async function requestPasswordReset(emailRaw: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  const users = await db.supplierUser.findMany({ where: { email, status: "ACTIVE", deletedAt: null, credential: { active: true } } });
  for (const u of users) {
    const token = await createInvite(u, "RESET");
    await sendResetMail(u, token).catch(() => {});
    await writePortalAudit({ userId: u.id, action: "PASSWORD_RESET_REQUESTED" });
  }
}
