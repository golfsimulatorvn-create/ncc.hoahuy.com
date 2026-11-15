"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { checkPasswordStrength } from "@/server/crypto";
import { writePortalAudit } from "@/server/audit";
import { clearPending, readPending, setPending } from "@/server/pending";
import { attemptPassword, consumeInviteWithPassword, issueOtp, notifyNewDevice, requestPasswordReset, verifyOtp } from "@/server/loginFlow";
import { clientInfo, createSession, destroySession, getSessionUser, isKnownDevice, revokeUserSessions, setDeviceCookie } from "@/server/session";
import { homeFor } from "@/server/permissions";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

export type AuthState = { error?: string; info?: string; choose?: { credentialId: number; supplierName: string }[]; email?: string; password?: string };

const emailSchema = z.string().trim().toLowerCase().email().max(200);

/** Buoc 1: email + mat khau. Thiet bi da nho -> vao thang; thiet bi moi -> gui ma OTP. */
export async function loginAction(_prev: AuthState | undefined, formData: FormData): Promise<AuthState> {
  const t = await getTranslations("auth.login");
  const email = emailSchema.safeParse(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const echo = typeof formData.get("email") === "string" ? String(formData.get("email")).trim() : "";
  if (!email.success || !password) return { error: t("bad"), email: echo };
  const credentialId = Number(formData.get("credentialId")) || null;
  const { ip } = await clientInfo();

  const r = await attemptPassword({ email: email.data, password, credentialId, ip });
  if (r.status === "locked") return { error: t("locked", { minutes: env.lockMinutes }), email: email.data };
  if (r.status === "bad") return { error: t("bad"), email: email.data };
  if (r.status === "choose") return { choose: r.options, email: email.data, password };

  const user = r.user;
  if (await isKnownDevice(user.id)) {
    await createSession(user.id);
    await writePortalAudit({ userId: user.id, supplierId: user.credential.crmSupplierId, role: user.role, action: "LOGIN", ip });
    redirect(homeFor(user.role));
  }
  await issueOtp(user, "LOGIN");
  await setPending(user.id, "LOGIN");
  redirect("/dang-nhap/ma");
}

/** Buoc 2: nhap ma 6 so (kich hoat / thiet bi moi / dat lai mat khau). */
export async function verifyOtpAction(_prev: AuthState | undefined, formData: FormData): Promise<AuthState> {
  const t = await getTranslations("auth");
  const pending = await readPending();
  if (!pending) redirect("/dang-nhap");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: t("otp.bad") };

  const res = await verifyOtp(pending.u, pending.p, code);
  if (res === "bad") return { error: t("otp.bad") };
  if (res === "expired") return { error: t("otp.expired") };
  if (res === "tooMany") return { error: t("otp.tooMany") };

  const user = await db.supplierUser.findFirst({ where: { id: pending.u, deletedAt: null }, include: { credential: true } });
  if (!user || !user.credential.active || user.status === "LOCKED" || !user.passwordHash) redirect("/dang-nhap");
  const { ip } = await clientInfo();

  if (pending.p === "ACTIVATE") {
    await db.supplierUser.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
  }
  if (pending.p === "RESET") {
    await revokeUserSessions(user.id, true); // doi mat khau thu hoi moi phien va moi thiet bi da nho
  }
  if (pending.p === "LOGIN") await notifyNewDevice(user, ip);

  await setDeviceCookie(user.id);
  await createSession(user.id);
  await clearPending();
  await writePortalAudit({ userId: user.id, supplierId: user.credential.crmSupplierId, role: user.role, action: `LOGIN_${pending.p}`, ip });
  redirect(homeFor(user.role));
}

export async function resendOtpAction(): Promise<AuthState> {
  const t = await getTranslations("auth");
  const pending = await readPending();
  if (!pending) redirect("/dang-nhap");
  const recent = await db.otpCode.count({ where: { userId: pending.u, purpose: pending.p, createdAt: { gte: new Date(Date.now() - env.otpMinutes * 60_000) } } });
  if (recent >= 5) return { error: t("otp.tooMany") };
  const user = await db.supplierUser.findFirst({ where: { id: pending.u, deletedAt: null } });
  if (!user) redirect("/dang-nhap");
  await issueOtp(user, pending.p);
  return { info: t("otp.resent") };
}

const pwSchema = z.object({ password: z.string().max(200), confirm: z.string().max(200) });

async function setPasswordFlow(purpose: "ACTIVATE" | "RESET", formData: FormData): Promise<AuthState> {
  const t = await getTranslations("auth.invite");
  const parsed = pwSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: t("invalid") };
  if (parsed.data.password !== parsed.data.confirm) return { error: t("mismatch") };
  const strength = checkPasswordStrength(parsed.data.password);
  if (strength !== "ok") return { error: t(strength) };

  const token = String(formData.get("token") ?? "");
  const user = await consumeInviteWithPassword(token, purpose, parsed.data.password);
  if (!user) return { error: t("invalid") };
  await issueOtp(user, purpose);
  await setPending(user.id, purpose);
  redirect("/dang-nhap/ma");
}

export async function activateAction(_prev: AuthState | undefined, formData: FormData): Promise<AuthState> {
  return setPasswordFlow("ACTIVATE", formData);
}

export async function resetPasswordAction(_prev: AuthState | undefined, formData: FormData): Promise<AuthState> {
  return setPasswordFlow("RESET", formData);
}

export async function forgotAction(_prev: AuthState | undefined, formData: FormData): Promise<AuthState> {
  const t = await getTranslations("auth.forgot");
  const email = emailSchema.safeParse(formData.get("email"));
  if (email.success) await requestPasswordReset(email.data);
  return { info: t("sent") }; // luon "da gui" de khong lo email co ton tai
}

export async function logoutAction(): Promise<void> {
  const u = await getSessionUser();
  await destroySession();
  if (u) await writePortalAudit({ userId: u.id, supplierId: u.crmSupplierId, role: u.role, action: "LOGOUT" });
  redirect("/dang-nhap");
}

/** Doi ngon ngu: luu theo tai khoan (neu da dang nhap) + cookie. */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "");
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 365 * 86_400, sameSite: "lax" });
  const u = await getSessionUser();
  if (u) await db.supplierUser.update({ where: { id: u.id }, data: { locale } });
  redirect(String(formData.get("back") || "/").startsWith("/") ? String(formData.get("back") || "/") : "/");
}
