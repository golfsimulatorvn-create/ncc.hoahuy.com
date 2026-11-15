"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePerm } from "@/server/session";
import { changeRole, inviteUser, lockUser, removeUser, resetPasswordFor, resendInvite, unlockUser, UserAdminError, type Actor } from "@/server/userAdmin";

const ROLES = ["ADMIN", "STAFF", "VIEWER", "COST_VIEWER"] as const;

/** Moi thao tac: quyen `users.manage` (chi Quan tri NCC) kiem o may chu, luon trong pham vi cong ty cua chinh nguoi dung. */
async function ctx() {
  const me = await requirePerm("users.manage");
  const actor: Actor = { userId: me.id, label: `${me.displayName} <${me.email}>`, role: me.role, supplierId: me.crmSupplierId };
  return { me, actor };
}

function back(kind: "ok" | "err", msg: string): never {
  redirect(`/nguoi-dung?${kind}=${encodeURIComponent(msg)}`);
}

async function run(fn: () => Promise<unknown>, okMsg: string): Promise<never> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof UserAdminError) back("err", e.code);
    throw e;
  }
  revalidatePath("/nguoi-dung");
  return back("ok", okMsg);
}

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().min(1).max(200), role: z.enum(ROLES) });

export async function inviteUserAction(formData: FormData): Promise<void> {
  const { me, actor } = await ctx();
  const p = inviteSchema.safeParse({ email: formData.get("email"), name: formData.get("name"), role: formData.get("role") });
  if (!p.success) back("err", "email");
  await run(() => inviteUser(me.credentialId, { ...p.data!, locale: me.locale }, actor), "invited");
}

const idSchema = z.coerce.number().int().positive();

async function targetOf(formData: FormData, allowSelf = false) {
  const { me, actor } = await ctx();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) back("err", "notFound");
  if (!allowSelf && id.data === me.id) back("err", "self");
  return { me, actor, id: id.data! };
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const { me, actor, id } = await targetOf(formData, true);
  const role = z.enum(ROLES).safeParse(formData.get("role"));
  if (!role.success) back("err", "invalid");
  await run(() => changeRole(me.credentialId, id, role.data!, actor), "done");
}

export async function lockUserAction(formData: FormData): Promise<void> {
  const { me, actor, id } = await targetOf(formData);
  await run(() => lockUser(me.credentialId, id, actor), "done");
}

export async function unlockUserAction(formData: FormData): Promise<void> {
  const { me, actor, id } = await targetOf(formData);
  await run(() => unlockUser(me.credentialId, id, actor), "done");
}

export async function resendInviteAction(formData: FormData): Promise<void> {
  const { me, actor, id } = await targetOf(formData);
  await run(() => resendInvite(me.credentialId, id, actor), "invited");
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const { me, actor, id } = await targetOf(formData);
  await run(() => resetPasswordFor(me.credentialId, id, actor), "invited");
}

export async function removeUserAction(formData: FormData): Promise<void> {
  const { me, actor, id } = await targetOf(formData);
  await run(() => removeUser(me.credentialId, id, actor), "done");
}
