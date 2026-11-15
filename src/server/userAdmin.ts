import { db } from "./db";
import { writePortalAudit } from "./audit";
import { createInvite, sendInviteMail, sendResetMail } from "./loginFlow";
import { revokeUserSessions } from "./session";
import { isLocale } from "@/i18n/config";
import type { PortalRole } from "@prisma/client";

/**
 * Quan ly tai khoan cua 1 NCC — dung chung cho man Nguoi dung (Quan tri NCC) va admin-api (Mua hang Hoa Huy tu CRM).
 * Quy tac: luon con it nhat 1 Quan tri dang hoat dong hoac da moi; khoa/doi vai tro/xoa huy moi phien ngay (SC-008).
 */
export class UserAdminError extends Error {
  constructor(public code: "lastAdmin" | "exists" | "notFound" | "invalid" | "hasAdmin", message: string) {
    super(message);
  }
}

const countAdmins = (credentialId: number, excludeUserId?: number) =>
  db.supplierUser.count({
    where: { credentialId, role: "ADMIN", deletedAt: null, status: { in: ["ACTIVE", "INVITED"] }, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
  });

export type Actor = { userId?: number | null; label: string; role?: string | null; supplierId: number };

async function getUser(credentialId: number, userId: number) {
  const u = await db.supplierUser.findFirst({ where: { id: userId, credentialId, deletedAt: null }, include: { credential: true } });
  if (!u) throw new UserAdminError("notFound", "Không tìm thấy người dùng.");
  return u;
}

export async function inviteUser(credentialId: number, input: { email: string; name: string; role: PortalRole; locale?: string }, actor: Actor) {
  const email = input.email.trim().toLowerCase();
  const cred = await db.supplierCredential.findUnique({ where: { id: credentialId } });
  if (!cred) throw new UserAdminError("notFound", "Không tìm thấy nhà cung cấp.");
  const existing = await db.supplierUser.findUnique({ where: { credentialId_email: { credentialId, email } } });
  if (existing && !existing.deletedAt) throw new UserAdminError("exists", "Email này đã có tài khoản.");
  const data = { displayName: input.name.trim(), role: input.role, locale: input.locale && isLocale(input.locale) ? input.locale : "vi", status: "INVITED" as const, passwordHash: null, deletedAt: null, failedLoginCount: 0, lockedUntil: null };
  const user = existing ? await db.supplierUser.update({ where: { id: existing.id }, data }) : await db.supplierUser.create({ data: { credentialId, email, ...data } });
  const token = await createInvite(user, "ACTIVATE");
  await sendInviteMail(user, cred.supplierName, token);
  await writePortalAudit({ userId: actor.userId, supplierId: actor.supplierId, role: actor.role, action: "USER_INVITED", entity: "user", entityId: user.id, detail: { by: actor.label, role: input.role } });
  return user;
}

export async function resendInvite(credentialId: number, userId: number, actor: Actor) {
  const u = await getUser(credentialId, userId);
  if (u.status !== "INVITED") throw new UserAdminError("invalid", "Tài khoản đã kích hoạt.");
  await sendInviteMail(u, u.credential.supplierName, await createInvite(u, "ACTIVATE"));
  await writePortalAudit({ userId: actor.userId, supplierId: actor.supplierId, role: actor.role, action: "USER_INVITE_RESENT", entity: "user", entityId: u.id, detail: { by: actor.label } });
}

export async function changeRole(credentialId: number, userId: number, role: PortalRole, actor: Actor) {
  const u = await getUser(credentialId, userId);
  if (u.role === "ADMIN" && role !== "ADMIN" && (await countAdmins(credentialId, u.id)) === 0) throw new UserAdminError("lastAdmin", "Công ty phải luôn còn ít nhất một Quản trị.");
  await db.supplierUser.update({ where: { id: u.id }, data: { role } });
  await revokeUserSessions(u.id); // vai tro moi co hieu luc ngay: buoc dang nhap lai (thiet bi da nho van giu)
  await writePortalAudit({ userId: actor.userId, supplierId: actor.supplierId, role: actor.role, action: "USER_ROLE_CHANGED", entity: "user", entityId: u.id, detail: { by: actor.label, from: u.role, to: role } });
}

export async function lockUser(credentialId: number, userId: number, actor: Actor) {
  const u = await getUser(credentialId, userId);
  if (u.role === "ADMIN" && u.status !== "LOCKED" && (await countAdmins(credentialId, u.id)) === 0) throw new UserAdminError("lastAdmin", "Công ty phải luôn còn ít nhất một Quản trị.");
  await db.supplierUser.update({ where: { id: u.id }, data: { status: "LOCKED" } });
  await revokeUserSessions(u.id, true);
  await writePortalAudit({ userId: actor.userId, supplierId: actor.supplierId, role: actor.role, action: "USER_LOCKED", entity: "user", entityId: u.id, detail: { by: actor.label } });
}

export async function unlockUser(credentialId: number, userId: number, actor: Actor) {
  const u = await getUser(credentialId, userId);
  await db.supplierUser.update({ where: { id: u.id }, data: { status: u.passwordHash ? "ACTIVE" : "INVITED", failedLoginCount: 0, lockedUntil: null } });
  await writePortalAudit({ userId: actor.userId, supplierId: actor.supplierId, role: actor.role, action: "USER_UNLOCKED", entity: "user", entityId: u.id, detail: { by: actor.label } });
}

/** Gui lien ket dat lai mat khau cho nguoi dung (khong bao gio tra mat khau). Chua kich hoat thi gui lai thu moi. */
export async function resetPasswordFor(credentialId: number, userId: number, actor: Actor) {
  const u = await getUser(credentialId, userId);
  if (u.status === "INVITED") return resendInvite(credentialId, userId, actor);
  await sendResetMail(u, await createInvite(u, "RESET"));
  await writePortalAudit({ userId: actor.userId, supplierId: actor.supplierId, role: actor.role, action: "USER_RESET_SENT", entity: "user", entityId: u.id, detail: { by: actor.label } });
}

export async function removeUser(credentialId: number, userId: number, actor: Actor) {
  const u = await getUser(credentialId, userId);
  if (u.role === "ADMIN" && (await countAdmins(credentialId, u.id)) === 0) throw new UserAdminError("lastAdmin", "Công ty phải luôn còn ít nhất một Quản trị.");
  await db.supplierUser.update({ where: { id: u.id }, data: { deletedAt: new Date(), status: "LOCKED" } });
  await revokeUserSessions(u.id, true);
  await writePortalAudit({ userId: actor.userId, supplierId: actor.supplierId, role: actor.role, action: "USER_REMOVED", entity: "user", entityId: u.id, detail: { by: actor.label } });
}

/** Tam ngung / mo lai ca NCC: moi phien bi huy ngay, khong ai dang nhap duoc. */
export async function setSupplierActive(credentialId: number, active: boolean, actor: Actor) {
  await db.supplierCredential.update({ where: { id: credentialId }, data: { active } });
  if (!active) {
    const users = await db.supplierUser.findMany({ where: { credentialId }, select: { id: true } });
    for (const u of users) await revokeUserSessions(u.id);
  }
  await writePortalAudit({ supplierId: actor.supplierId, action: active ? "SUPPLIER_RESUMED" : "SUPPLIER_SUSPENDED", detail: { by: actor.label } });
}
