import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { requirePerm } from "@/server/session";
import { changeRoleAction, inviteUserAction, lockUserAction, removeUserAction, resendInviteAction, resetPasswordAction, unlockUserAction } from "./actions";

const ROLES = ["ADMIN", "STAFF", "VIEWER", "COST_VIEWER"] as const;
const ROLE_CHIP: Record<string, string> = { ADMIN: "bg-forest-soft text-forest", STAFF: "bg-done-bg text-done-fg", VIEWER: "bg-info-bg text-info-fg", COST_VIEWER: "bg-part-bg text-part-fg" };
const STATUS_TEXT: Record<string, string> = { ACTIVE: "text-ok-fg", INVITED: "text-warn-fg", LOCKED: "text-danger-fg" };

/** NCC-06-01 Nguoi dung cua cong ty (mockup man 8). Chi Quan tri NCC; luon trong pham vi cong ty cua chinh minh. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requirePerm("users.manage");
  const t = await getTranslations("users");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const sp = await searchParams;
  const users = await db.supplierUser.findMany({ where: { credentialId: me.credentialId, deletedAt: null }, orderBy: { id: "asc" } });
  const fmt = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(d);
  const bodyLines = t("rolesBody").split("|");

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <div><div className="text-[11px] tracking-wider text-ink-muted">{t("code")}</div><h1 className="text-[20px] font-bold">{t("title")}</h1></div>
      </div>
      {sp.ok && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-ok-fg">{t(sp.ok === "invited" ? "invited" : "done")}</p>}
      {sp.err && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t(`err.${sp.err}` as never)}</p>}

      <form action={inviteUserAction} className="card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_200px_auto] sm:items-end">
        <label className="field">{t("email")}<input name="email" type="email" required className="input" /></label>
        <label className="field">{t("name")}<input name="name" required maxLength={200} className="input" /></label>
        <label className="field">{t("role")}
          <select name="role" defaultValue="STAFF" className="input">{ROLES.map((r) => <option key={r} value={r}>{tc(`role.${r}`)}</option>)}</select>
        </label>
        <button type="submit" className="btn-primary">{t("sendInvite")}</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="bg-surface-sunk text-left text-[12px] uppercase tracking-wide text-ink-2">
              <th className="p-3 font-semibold">{t("name")}</th><th className="p-3 font-semibold">{t("role")}</th><th className="p-3 font-semibold">{t("status")}</th>
              <th className="p-3 font-semibold">{t("lastLogin")}</th><th className="p-3 text-right font-semibold">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === me.id;
              return (
                <tr key={u.id} className="border-t border-line align-top">
                  <td className="p-3"><div className="font-semibold">{u.displayName}</div><div className="break-all text-[12px] text-ink-muted">{u.email}</div></td>
                  <td className="p-3">
                    <form action={changeRoleAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="role" defaultValue={u.role} aria-label={t("changeRole")} className="input py-1.5 text-[13px]">{ROLES.map((r) => <option key={r} value={r}>{tc(`role.${r}`)}</option>)}</select>
                      <button type="submit" className={`chip ${ROLE_CHIP[u.role]} cursor-pointer`}>{t("apply")}</button>
                    </form>
                  </td>
                  <td className={`p-3 font-semibold ${STATUS_TEXT[u.status]}`}>{tc(`userStatus.${u.status}`)}</td>
                  <td className="p-3 text-ink-2">{u.lastLoginAt ? fmt(u.lastLoginAt) : t("never")}</td>
                  <td className="p-3">
                    {self ? <div className="text-right text-ink-muted">{t("you")}</div> : (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {u.status === "INVITED" && <form action={resendInviteAction}><input type="hidden" name="id" value={u.id} /><button className="btn-secondary min-h-9 px-2.5 py-1 text-[13px]">{t("resend")}</button></form>}
                        {u.status === "ACTIVE" && <form action={resetPasswordAction}><input type="hidden" name="id" value={u.id} /><button className="btn-secondary min-h-9 px-2.5 py-1 text-[13px]">{t("reset")}</button></form>}
                        {u.status === "LOCKED"
                          ? <form action={unlockUserAction}><input type="hidden" name="id" value={u.id} /><button className="btn-secondary min-h-9 px-2.5 py-1 text-[13px]">{t("unlock")}</button></form>
                          : <form action={lockUserAction}><input type="hidden" name="id" value={u.id} /><button className="btn-secondary min-h-9 px-2.5 py-1 text-[13px]">{t("lock")}</button></form>}
                        <form action={removeUserAction}><input type="hidden" name="id" value={u.id} /><button className="btn-secondary min-h-9 px-2.5 py-1 text-[13px] text-danger-fg">{t("remove")}</button></form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4"><div className="mb-2 font-bold">{t("rolesTitle")}</div><ul className="grid gap-1.5 text-ink-2">{bodyLines.map((l) => <li key={l}>{l}</li>)}</ul></div>
        <div className="card p-4"><div className="mb-2 font-bold">{t("securityTitle")}</div><p className="leading-relaxed text-ink-2">{t("securityBody")}</p></div>
      </div>
    </div>
  );
}
