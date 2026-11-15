import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { can } from "@/server/permissions";
import { CrmError } from "@/server/crmClient";
import { getRfq, type RfqDetail } from "@/server/crmRfq";
import { requirePerm } from "@/server/session";
import { fmtDate } from "../../don-mua/format";
import { rfqBadge } from "../badge";
import { saveDraftAction, submitQuoteAction } from "../actions";

/** NCC-03-02 Bao gia RFQ (mockup man 5). Don gia = gia ban ra cho Hoa Huy: chi Quan tri NCC thay va nhap; vai tro khac chi xem yeu cau. */
export default async function RfqQuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requirePerm("rfq.view");
  const t = await getTranslations("rfq");
  const locale = await getLocale();
  const { id } = await params;
  const sp = await searchParams;
  const rfqId = Number(id);
  if (!Number.isInteger(rfqId) || rfqId <= 0) notFound();

  let r: RfqDetail;
  try {
    r = await getRfq(me, rfqId);
  } catch (e) {
    if (e instanceof CrmError && (e.status === 404 || e.status === 403)) notFound();
    if (e instanceof CrmError) return <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t("unavailable")}</p>;
    throw e;
  }
  const b = rfqBadge({ status: r.status, result: r.result, submitted: r.submitted, dueAt: r.dueAt });
  const isOpen = r.status === "DA_GUI" && new Date(r.dueAt).getTime() >= Date.now();
  const canQuote = can(me.role, "rfq.quote") && isOpen;
  const showPrice = r.lines.some((l) => "unitPrice" in l);
  const key = crypto.randomUUID();

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <div><div className="text-[11px] tracking-wider text-ink-muted"><Link href="/bao-gia">{t("title")}</Link> · {t("code2")}</div><h1 className="text-[20px] font-bold">{r.code}</h1></div>
        <span className={`chip ${b.cls}`}>{t(`badge.${b.key}` as never)}</span>
      </div>
      {sp.ok && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-ok-fg">{t(`ok.${sp.ok}` as never)}</p>}
      {sp.err && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t(`err.${sp.err}` as never)}</p>}
      <section className="card grid gap-3 p-4 sm:grid-cols-3">
        <div><div className="text-[12px] text-ink-muted">{t("due")}</div><div className="font-semibold">{fmtDate(r.dueAt, locale)}</div></div>
        <div className="sm:col-span-2"><div className="text-[12px] text-ink-muted">{t("note")}</div><div className="min-w-0 break-words">{r.note || "—"}</div></div>
      </section>
      {!can(me.role, "rfq.quote") && <p className="rounded-lg border border-line bg-surface-sunk px-3 py-2 text-ink-2">{t("adminOnly")}</p>}

      <form action={saveDraftAction} className="grid min-w-0 gap-4">
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="key" value={key} />
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr className="bg-surface-sunk text-left text-[12px] uppercase tracking-wide text-ink-2">
                <th className="p-3 font-semibold">{t("item")}</th>
                <th className="p-3 text-right font-semibold">{t("qty")}</th>
                {showPrice && <th className="p-3 font-semibold">{t("unitPrice")}</th>}
                {showPrice && <th className="p-3 font-semibold">{t("leadDays")}</th>}
              </tr>
            </thead>
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.id} className="border-t border-line align-top">
                  <td className="p-3"><div className="min-w-0 break-words font-semibold">{l.name}</div><div className="text-[12px] text-ink-muted">{l.code}</div></td>
                  <td className="p-3 text-right tabular-nums">{l.qty} {l.unit}</td>
                  {showPrice && (
                    <td className="p-3">
                      {canQuote
                        ? <input name={`price_${l.id}`} inputMode="decimal" defaultValue={l.unitPrice ?? ""} aria-label={t("unitPrice")} className="input w-36 py-1.5 text-right" />
                        : <span className="tabular-nums">{l.unitPrice != null ? new Intl.NumberFormat(locale).format(l.unitPrice) : "—"}</span>}
                    </td>
                  )}
                  {showPrice && (
                    <td className="p-3">
                      {canQuote
                        ? <input name={`lead_${l.id}`} inputMode="numeric" defaultValue={l.leadTimeDays ?? ""} aria-label={t("leadDays")} className="input w-24 py-1.5 text-right" />
                        : <span className="tabular-nums">{l.leadTimeDays ?? "—"}</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canQuote && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" value="draft" className="btn-secondary">{t("saveDraft")}</button>
            <button type="submit" value="submit" formAction={submitQuoteAction} className="btn-primary">{t("submit")}</button>
            <p className="min-w-0 flex-1 text-[12px] text-ink-muted">{t("hint")}</p>
          </div>
        )}
        {!isOpen && r.status === "DA_GUI" && <p className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t("err.closed")}</p>}
      </form>
    </div>
  );
}
