import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CrmError } from "@/server/crmClient";
import { listOrders, type OrderRow } from "@/server/crmOrders";
import { requirePerm } from "@/server/session";
import { fmtDate, fmtMoney, STATUS_CHIP } from "./format";

/** NCC-02-01 Don mua hang (mockup man 3). Vai tro khac Quan tri: CRM khong tra gia/tong tien -> khong co cot tien. */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const me = await requirePerm("orders.view");
  const t = await getTranslations("orders");
  const locale = await getLocale();
  const sp = await searchParams;
  const filter = sp.s ?? "all";

  let rows: OrderRow[] = [];
  let failed = false;
  try { rows = await listOrders(me); } catch (e) { failed = true; if (!(e instanceof CrmError)) throw e; }

  const tabs = ["all", "SENT", "CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const;
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const showMoney = rows.some((r) => r.total !== undefined);
  const waiting = rows.filter((r) => r.status === "SENT").length;

  return (
    <div className="grid min-w-0 gap-4">
      <div><div className="text-[11px] tracking-wider text-ink-muted">{t("code")}</div><h1 className="text-[20px] font-bold">{t("title")}</h1></div>
      {failed && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t("unavailable")}</p>}
      {waiting > 0 && <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-warn-fg">{t("waitingConfirm", { count: waiting })}</p>}

      <nav className="flex gap-1.5 overflow-x-auto" aria-label={t("filter")}>
        {tabs.map((s) => (
          <Link key={s} href={s === "all" ? "/don-mua" : `/don-mua?s=${s}`} aria-current={filter === s ? "page" : undefined}
            className={`min-h-9 flex-none whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-semibold ${filter === s ? "border-forest bg-forest text-white" : "border-line-strong bg-white text-ink-2"}`}>
            {s === "all" ? t("all") : t(`status.${s}`)}{s !== "all" && <span className="ml-1 opacity-70">{rows.filter((r) => r.status === s).length}</span>}
          </Link>
        ))}
      </nav>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="bg-surface-sunk text-left text-[12px] uppercase tracking-wide text-ink-2">
              <th className="p-3 font-semibold">{t("po")}</th><th className="p-3 font-semibold">{t("orderDate")}</th>
              <th className="p-3 font-semibold">{t("expected")}</th><th className="p-3 font-semibold">{t("eta")}</th>
              <th className="p-3 text-right font-semibold">{t("received")}</th>
              {showMoney && <th className="p-3 text-right font-semibold">{t("total")}</th>}
              <th className="p-3 font-semibold">{t("statusCol")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="p-3 font-semibold"><Link href={`/don-mua/${r.id}`}>{r.code}</Link>{r.priceChanged && <span className="chip ml-2 bg-warn-bg text-warn-fg">{t("priceChanged")}</span>}</td>
                <td className="p-3">{fmtDate(r.orderDate, locale)}</td>
                <td className="p-3">{fmtDate(r.expectedDeliveryDate, locale) || "—"}</td>
                <td className="p-3">{fmtDate(r.supplierEtaDate, locale) || "—"}</td>
                <td className="p-3 text-right tabular-nums">{r.receivedQty}/{r.totalQty}</td>
                {showMoney && <td className="p-3 text-right tabular-nums">{r.total !== undefined ? fmtMoney(r.total, "VND", locale) : ""}</td>}
                <td className="p-3"><span className={`chip ${STATUS_CHIP[r.status] ?? "bg-done-bg text-done-fg"}`}>{t(`status.${r.status}` as never)}</span></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={showMoney ? 7 : 6} className="p-6 text-center text-ink-muted">{t("empty")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
