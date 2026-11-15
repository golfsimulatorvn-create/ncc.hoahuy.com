import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CrmError } from "@/server/crmClient";
import { getStatement, getSummary, listItems, listReconciliations, type PayableItem, type PayableSummary, type Reconciliation, type Statement } from "@/server/crmPayables";
import { requirePerm } from "@/server/session";
import { fmtDate, fmtMoney } from "../don-mua/format";
import { confirmMatchAction, reportMismatchAction } from "./actions";

const day = /^\d{4}-\d{2}-\d{2}$/;

/** Mac dinh: thang truoc (ky thuong doi chieu); gio Viet Nam. */
function defaultRange(): { from: string; to: string } {
  const now = new Date(Date.now() + 7 * 3600_000);
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const from = new Date(Date.UTC(y, m - 1, 1)), to = new Date(Date.UTC(y, m, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** NCC-04-01 Cong no va thanh toan (mockup man 6): chi doc tu so Ke toan da ghi so; chi Quan tri NCC. */
export default async function PayablesPage({ searchParams }: { searchParams: Promise<{ s?: string; tu?: string; den?: string; ok?: string; err?: string }> }) {
  const me = await requirePerm("payables.view");
  const t = await getTranslations("payables");
  const locale = await getLocale();
  const sp = await searchParams;
  const status = sp.s === "all" ? "all" : "open";
  const def = defaultRange();
  const from = sp.tu && day.test(sp.tu) ? sp.tu : def.from;
  const to = sp.den && day.test(sp.den) ? sp.den : def.to;
  const key = crypto.randomUUID();

  let summary: PayableSummary | null = null, items: PayableItem[] = [], statement: Statement | null = null, recs: Reconciliation[] = [];
  let failed = false;
  try {
    [summary, items, recs] = await Promise.all([getSummary(me), listItems(me, status), listReconciliations(me)]);
    if (to >= from) statement = await getStatement(me, from, to);
  } catch (e) {
    failed = true;
    if (!(e instanceof CrmError)) throw e;
  }
  const money = (v: number) => fmtMoney(v, "VND", locale);

  return (
    <div className="grid min-w-0 gap-4">
      <div><div className="text-[11px] tracking-wider text-ink-muted">{t("code")}</div><h1 className="text-[20px] font-bold">{t("title")}</h1></div>
      <p className="rounded-lg border border-info-bg bg-info-bg px-3 py-2 text-info-fg">{t("source")}</p>
      {failed && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t("unavailable")}</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-ok-fg">{t(`ok.${sp.ok}` as never)}</p>}
      {sp.err && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t(`err.${sp.err}` as never)}</p>}

      {summary && (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="card p-4"><div className="text-[12px] text-ink-muted">{t("balance")}</div><div className="text-[22px] font-bold tabular-nums">{money(summary.balance)}</div><div className="text-[12px] text-ink-muted">{t("asOf", { date: fmtDate(summary.asOf, locale) })}</div></div>
          <div className="card p-4"><div className="text-[12px] text-ink-muted">{t("overdue")}</div><div className="text-[22px] font-bold tabular-nums text-danger-fg">{money(summary.overdue)}</div></div>
          <div className="card p-4"><div className="text-[12px] text-ink-muted">{t("openInvoices")}</div><div className="text-[22px] font-bold tabular-nums">{summary.openInvoices}</div></div>
        </section>
      )}

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
          <h2 className="text-[15px] font-bold">{t("invoices")}</h2>
          <nav className="flex gap-1.5" aria-label={t("filter")}>
            {(["open", "all"] as const).map((s) => (
              <Link key={s} href={`/cong-no?s=${s}&tu=${from}&den=${to}`} aria-current={status === s ? "page" : undefined}
                className={`min-h-9 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${status === s ? "border-forest bg-forest text-white" : "border-line-strong bg-white text-ink-2"}`}>{t(`filter_${s}`)}</Link>
            ))}
          </nav>
        </div>
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="bg-surface-sunk text-left text-[12px] uppercase tracking-wide text-ink-2">
              <th className="p-3 font-semibold">{t("docNo")}</th><th className="p-3 font-semibold">{t("docDate")}</th><th className="p-3 font-semibold">{t("dueDate")}</th>
              <th className="p-3 text-right font-semibold">{t("amount")}</th><th className="p-3 text-right font-semibold">{t("paid")}</th><th className="p-3 text-right font-semibold">{t("remaining")}</th>
              <th className="p-3 font-semibold">{t("po")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-line">
                <td className="p-3 font-semibold">{i.docNo}{i.overdue && <span className="chip ml-2 bg-danger-bg text-danger-fg">{t("overdueTag")}</span>}</td>
                <td className="p-3">{fmtDate(i.docDate, locale)}</td><td className="p-3">{fmtDate(i.dueDate, locale)}</td>
                <td className="p-3 text-right tabular-nums">{money(i.amount)}</td><td className="p-3 text-right tabular-nums">{money(i.paidAmount)}</td>
                <td className="p-3 text-right font-semibold tabular-nums">{money(i.remaining)}</td><td className="p-3">{i.purchaseOrderCode ?? "—"}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-ink-muted">{t("empty")}</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card grid gap-3 p-4">
        <h2 className="text-[15px] font-bold">{t("reconcile")}</h2>
        <form method="get" action="/cong-no" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="s" value={status} />
          <label className="field">{t("from")}<input type="date" name="tu" defaultValue={from} className="input" /></label>
          <label className="field">{t("to")}<input type="date" name="den" defaultValue={to} className="input" /></label>
          <button type="submit" className="btn-secondary">{t("view")}</button>
        </form>
        {statement && (
          <dl className="grid gap-3 sm:grid-cols-4">
            {([["opening", statement.opening], ["issued", statement.issued], ["paidInPeriod", statement.paid], ["closing", statement.closing]] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-surface-sunk p-3"><dt className="text-[12px] text-ink-muted">{t(k)}</dt><dd className="text-[16px] font-bold tabular-nums">{money(v)}</dd></div>
            ))}
          </dl>
        )}
        {statement && (
          <form action={confirmMatchAction} className="grid gap-3">
            <input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} /><input type="hidden" name="key" value={key} />
            <label className="field">{t("note")}<input name="note" maxLength={1000} className="input" placeholder={t("notePlaceholder")} /></label>
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn-primary">{t("confirmMatch")}</button>
              <button type="submit" formAction={reportMismatchAction} className="btn-secondary">{t("reportMismatch")}</button>
            </div>
            <p className="text-[12px] text-ink-muted">{t("reconcileHint")}</p>
          </form>
        )}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="p-4 pb-2 text-[15px] font-bold">{t("history")}</h2>
        <table className="w-full min-w-[640px] border-collapse">
          <tbody>
            {recs.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="p-3">{fmtDate(r.periodFrom, locale)} – {fmtDate(r.periodTo, locale)}</td>
                <td className="p-3 text-right tabular-nums">{money(r.closingBalance)}</td>
                <td className="p-3"><span className={`chip ${r.status === "KHOP" ? "bg-ok-bg text-ok-fg" : "bg-danger-bg text-danger-fg"}`}>{t(`recStatus.${r.status}`)}</span></td>
                <td className="min-w-0 break-words p-3 text-ink-2">{r.note}</td>
                <td className="p-3 text-[12px] text-ink-muted">{r.confirmedByName} · {fmtDate(r.createdAt, locale)}</td>
              </tr>
            ))}
            {recs.length === 0 && <tr><td className="p-6 text-center text-ink-muted">{t("noHistory")}</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
