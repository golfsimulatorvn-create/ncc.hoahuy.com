import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { logoutAction } from "@/app/(auth)/actions";
import { can, NAV } from "@/server/permissions";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

/** Khung chung sau dang nhap (mockup man 2-9): thanh trai theo vai tro, thanh tren co ngon ngu/vai tro/nguoi dung. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const t = await getTranslations();
  const items = NAV.filter((n) => can(user.role, n.perm));
  return (
    <div className="flex min-h-screen min-w-0 flex-col lg:flex-row">
      <aside className="flex flex-none flex-col gap-1 bg-forest p-3 text-forest-text lg:w-[232px] lg:p-3 lg:pt-5">
        <div className="flex items-center gap-2.5 px-2.5 pb-3 lg:pb-4">
          <div className="h-7 w-1 rounded-sm bg-brand" />
          <div className="leading-tight"><div className="text-[15px] font-bold tracking-[0.08em]">{t("common.brand")}</div><div className="text-[11px] text-forest-mute">{t("common.appName")}</div></div>
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label={t("nav.menu")}>
          {items.map((n) => (
            <Link key={n.key} href={n.href} className="min-h-11 flex-none whitespace-nowrap rounded-lg px-3 py-2.5 text-forest-text hover:bg-white/10">{t(`nav.${n.key}`)}</Link>
          ))}
        </nav>
        <div className="mt-2 hidden border-t border-white/15 p-3 text-[12px] text-forest-mute lg:mt-auto lg:block">
          <div className="font-semibold text-forest-text">{user.supplierName}</div>
          <div>{t("common.supplierCode", { code: user.supplierCode })}</div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-5 py-3">
          <span className="min-w-0 break-words text-[13px] font-semibold lg:hidden">{user.supplierName}</span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <LocaleSwitch back="/" />
            <span className="chip bg-forest-soft text-forest">{t(`common.role.${user.role}`)}</span>
            <div className="hidden min-w-0 text-right leading-tight sm:block"><div className="font-semibold">{user.displayName}</div><div className="text-[12px] text-ink-muted">{user.email}</div></div>
            <form action={logoutAction}><button type="submit" className="btn-secondary min-h-9 px-3 py-1.5 text-[13px]">{t("common.logout")}</button></form>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-5 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
