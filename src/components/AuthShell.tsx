import { getTranslations } from "next-intl/server";
import { LocaleSwitch } from "./LocaleSwitch";

/** Khung trang truoc dang nhap (mockup man 1): ben trai thuong hieu, ben phai the noi dung. */
export async function AuthShell({ children, code, back = "/dang-nhap" }: { children: React.ReactNode; code?: string; back?: string }) {
  const t = await getTranslations();
  return (
    <div className="grid min-h-screen min-w-0 lg:grid-cols-[1fr_560px]">
      <section className="hidden bg-forest p-14 text-forest-text lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <div className="h-9 w-[5px] rounded-sm bg-brand" />
          <div className="leading-tight"><div className="text-[20px] font-bold tracking-[0.1em]">{t("common.brand")}</div><div className="text-[12px] text-forest-mute">Năng lượng Xanh</div></div>
        </div>
        <div className="mt-auto max-w-md">
          <h1 className="text-[34px] font-bold leading-tight">{t("common.appName")}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-forest-mute">{t("auth.login.welcome")}</p>
        </div>
        <div className="mt-10 text-[12px] text-forest-mute">ncc.hoahuy.com</div>
      </section>
      <section className="flex min-w-0 flex-col justify-center gap-4 p-5 sm:p-10">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="flex items-center gap-2 lg:hidden"><div className="h-7 w-1 rounded-sm bg-brand" /><span className="font-bold tracking-widest">{t("common.brand")}</span></div>
          <LocaleSwitch back={back} />
        </div>
        <div className="card grid gap-4 p-6">
          {code && <div className="text-[11px] tracking-wider text-ink-muted">{code}</div>}
          {children}
        </div>
      </section>
    </div>
  );
}
