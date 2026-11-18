import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Hai tab cua muc Gia dau vao: NCC thu cap (NCC-05-01) va Theo ma hang Hoa Huy (NCC-05-03, specs/064). */
export async function CostTabs({ active }: { active: "sub" | "code" }) {
  const t = await getTranslations("costs");
  const cls = (on: boolean) => `whitespace-nowrap border-b-[3px] px-4 py-2.5 ${on ? "border-brand font-semibold text-ink" : "border-transparent text-ink-2"}`;
  return (
    <div role="group" className="flex min-w-0 gap-1 overflow-x-auto border-b border-line" aria-label={t("title")}>
      <Link href="/gia-dau-vao" className={cls(active === "sub")}>{t("tabSub")}</Link>
      <Link href="/gia-dau-vao/theo-ma" className={cls(active === "code")}>{t("tabCode")}</Link>
    </div>
  );
}
