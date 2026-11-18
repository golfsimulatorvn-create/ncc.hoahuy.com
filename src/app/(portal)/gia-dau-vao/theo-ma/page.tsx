import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CostTabs } from "@/components/CostTabs";
import { can } from "@/server/permissions";
import { CrmError } from "@/server/crmClient";
import { getItemCostHistory, listItemCosts, type ItemCostHistoryRow, type ItemCostList } from "@/server/crmItemCosts";
import { requirePerm } from "@/server/session";
import { fmtDate, fmtMoney } from "../../don-mua/format";
import { saveItemCostsAction } from "./actions";

type SP = { q?: string; missing?: string; page?: string; hist?: string; ok?: string; err?: string };

/** NCC-05-03 Gia dau vao theo ma hang Hoa Huy (specs/064): moi ma trong don mua / RFQ + gia dau vao NCC tu dien, dung lai lan sau.
 * Gia ban + lai gop chi Quan tri NCC (orders.price). Du lieu rieng cua NCC, Hoa Huy khong doc. */
export default async function ItemCostsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requirePerm("costs.view");
  const t = await getTranslations("costs");
  const locale = await getLocale();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const canEdit = can(me.role, "costs.edit");
  const showSell = can(me.role, "orders.price");

  let data: ItemCostList | null = null;
  let hist: ItemCostHistoryRow[] = [];
  try {
    data = await listItemCosts(me, { q: sp.q, missing: sp.missing === "1", page });
    if (sp.hist) hist = await getItemCostHistory(me, sp.hist);
  } catch (e) {
    if (!(e instanceof CrmError)) throw e;
  }
  const rows = data?.rows ?? [];
  const key = crypto.randomUUID();
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const m: Record<string, string | undefined> = { q: sp.q, missing: sp.missing, page: sp.page, ...over };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, v);
    const s = p.toString();
    return `/gia-dau-vao/theo-ma${s ? `?${s}` : ""}`;
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const cols = 6 + (showSell ? 2 : 0);
  const num = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: Number.isInteger(v) ? 0 : 3 }).format(v);

  return (
    <div className="grid min-w-0 gap-4">
      <div><div className="text-[11px] tracking-wider text-ink-muted">{t("code3")}</div><h1 className="text-[20px] font-bold">{t("title")}</h1></div>
      <CostTabs active="code" />
      <p className="rounded-lg border border-info-bg bg-info-bg px-3 py-2 text-info-fg">{t("private")}</p>
      {!data && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t("unavailable")}</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-ok-fg">{t(`ok.${sp.ok}` as never)}</p>}
      {sp.err && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t(`err.${sp.err}` as never)}</p>}

      <form method="get" className="card flex min-w-0 flex-wrap items-center gap-3 p-3">
        <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder={t("byCode.search")} aria-label={t("byCode.search")} className="input min-w-0 flex-1 basis-56" />
        <label className="flex min-h-[44px] items-center gap-2">
          <input type="checkbox" name="missing" value="1" defaultChecked={sp.missing === "1"} />
          {t("byCode.onlyMissing")}
          {data ? <span className="chip bg-warn-bg text-warn-fg">{t("byCode.missingCount", { count: data.missingCount })}</span> : null}
        </label>
        <button type="submit" className="btn-secondary">{t("byCode.filter")}</button>
      </form>

      <form action={saveItemCostsAction} className="card grid min-w-0">
        <input type="hidden" name="key" value={key} />
        <input type="hidden" name="count" value={rows.length} />
        <input type="hidden" name="ret_q" value={sp.q ?? ""} />
        <input type="hidden" name="ret_missing" value={sp.missing ?? ""} />
        <input type="hidden" name="ret_page" value={sp.page ?? ""} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="bg-surface-sunk text-left text-[12px] uppercase tracking-wide text-ink-2">
                <th className="p-3 font-semibold">{t("byCode.item")}</th>
                <th className="p-3 font-semibold">{t("unit")}</th>
                <th className="p-3 text-right font-semibold">{t("byCode.qty")}</th>
                <th className="p-3 text-right font-semibold">{t("byCode.cost")}</th>
                <th className="p-3 font-semibold">{t("byCode.currency")}</th>
                {showSell && <th className="p-3 text-right font-semibold">{t("byCode.sell")}</th>}
                {showSell && <th className="p-3 text-right font-semibold">{t("byCode.gross")}</th>}
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.code} className="border-t border-line align-middle">
                  <td className="min-w-0 break-words p-3"><div className="font-semibold">{r.code}</div><div className="text-[12px] text-ink-muted">{r.name}</div></td>
                  <td className="p-3">{r.unit}</td>
                  <td className="p-3 text-right tabular-nums">{num(r.qtyOrdered)}</td>
                  <td className="p-3 text-right">
                    <input type="hidden" name={`c_${i}`} value={r.code} />
                    <input type="hidden" name={`o_${i}`} value={r.inputPrice ?? ""} />
                    <input type="hidden" name={`oc_${i}`} value={r.currency} />
                    {canEdit
                      ? <input name={`p_${i}`} defaultValue={r.inputPrice ?? ""} inputMode="decimal" placeholder={t("byCode.enter")} aria-label={`${t("byCode.cost")} ${r.code}`} className="input min-h-[44px] w-32 min-w-0 text-right" />
                      : <span className="tabular-nums">{r.inputPrice == null ? "—" : fmtMoney(r.inputPrice, r.currency, locale)}</span>}
                  </td>
                  <td className="p-3">
                    {canEdit
                      ? <select name={`cur_${i}`} defaultValue={r.currency} aria-label={t("byCode.currency")} className="input min-h-[44px] min-w-0">{["VND", "USD", "CNY", "EUR"].map((c) => <option key={c}>{c}</option>)}</select>
                      : r.currency}
                  </td>
                  {showSell && <td className="p-3 text-right tabular-nums">{r.sellPrice == null ? "—" : fmtMoney(r.sellPrice, r.sellCurrency ?? "VND", locale)}</td>}
                  {showSell && (
                    <td className="p-3 text-right tabular-nums">
                      {r.grossAmount == null || r.grossPct == null
                        ? "—"
                        : <>{fmtMoney(r.grossAmount, r.sellCurrency ?? "VND", locale)} <span className={`chip ${r.grossPct >= 0 ? "bg-ok-bg text-ok-fg" : "bg-danger-bg text-danger-fg"}`}>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(r.grossPct)}%</span></>}
                    </td>
                  )}
                  <td className="p-3"><Link href={href({ hist: r.code })} className="inline-flex min-h-[44px] items-center text-accent">{t("byCode.history")}</Link></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={cols} className="p-6 text-center text-ink-muted">{t("byCode.empty")}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-3">
          <span className="text-[12px] text-ink-muted">{data ? t("byCode.counter", { shown: rows.length, total: data.total, all: data.totalCodes }) : ""}</span>
          <div className="flex flex-wrap items-center gap-2">
            {page > 1 && <Link href={href({ page: String(page - 1) })} className="btn-secondary">{t("byCode.prev")}</Link>}
            {page < pages && <Link href={href({ page: String(page + 1) })} className="btn-secondary">{t("byCode.next")}</Link>}
            {canEdit && rows.length > 0 && <button type="submit" className="btn-primary">{t("byCode.save")}</button>}
          </div>
        </div>
      </form>

      {sp.hist && (
        <section className="card grid gap-2 p-4">
          <h2 className="text-[15px] font-bold">{t("byCode.historyOf", { code: sp.hist })}</h2>
          {hist.length === 0 && <p className="text-ink-muted">{t("byCode.noHistory")}</p>}
          {hist.map((h, i) => (
            <div key={i} className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              <span>{fmtDate(h.at, locale)}</span>
              <span className="tabular-nums">{h.from == null ? t("byCode.none") : fmtMoney(h.from, h.currency, locale)} → {h.to == null ? t("byCode.removed") : fmtMoney(h.to, h.currency, locale)}</span>
              <span className="text-ink-muted">{h.by ?? ""}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
