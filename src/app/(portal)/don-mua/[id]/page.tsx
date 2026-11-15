import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { can } from "@/server/permissions";
import { DocsBlock } from "@/components/DocsBlock";
import { CrmError } from "@/server/crmClient";
import { getOrder, type OrderDetail } from "@/server/crmOrders";
import { requirePerm } from "@/server/session";
import { confirmOrderAction, subVendorAction } from "../actions";
import { fmtDate, fmtMoney, STATUS_CHIP } from "../format";

/** NCC-02-02 Chi tiet don mua hang (mockup man 4). Gia/tien/thanh toan chi co khi CRM tra (Quan tri NCC). Khong co o sua gia. */
export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; dok?: string; derr?: string }> }) {
  const me = await requirePerm("orders.view");
  const t = await getTranslations("orders");
  const locale = await getLocale();
  const { id } = await params;
  const sp = await searchParams;
  const poId = Number(id);
  if (!Number.isInteger(poId) || poId <= 0) notFound();

  let o: OrderDetail;
  try {
    o = await getOrder(me, poId);
  } catch (e) {
    if (e instanceof CrmError && e.status === 404) notFound();
    if (e instanceof CrmError) return <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t("unavailable")}</p>;
    throw e;
  }
  const showPrice = o.lines.some((l) => l.unitPrice !== undefined);
  const canWrite = can(me.role, "orders.confirm");
  const canConfirm = canWrite && o.status === "SENT";
  const changed = o.lines.filter((l) => l.priceChanged);
  const key = crypto.randomUUID();
  const money = (v: number) => fmtMoney(v, o.currency, locale);

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <div><div className="text-[11px] tracking-wider text-ink-muted"><Link href="/don-mua">{t("title")}</Link> · {t("code2")}</div><h1 className="text-[20px] font-bold">{o.code}</h1></div>
        <span className={`chip ${STATUS_CHIP[o.status] ?? "bg-done-bg text-done-fg"}`}>{t(`status.${o.status}` as never)}</span>
      </div>
      {sp.ok && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-ok-fg">{t(`ok.${sp.ok}` as never)}</p>}
      {sp.err && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t(`err.${sp.err}` as never)}</p>}
      {changed.length > 0 && <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-warn-fg">{t("priceChangedBanner", { count: changed.length })}</p>}

      <section className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><div className="text-[12px] text-ink-muted">{t("orderDate")}</div><div className="font-semibold">{fmtDate(o.orderDate, locale)}</div></div>
        <div><div className="text-[12px] text-ink-muted">{t("expected")}</div><div className="font-semibold">{fmtDate(o.expectedDeliveryDate, locale) || "—"}</div></div>
        <div><div className="text-[12px] text-ink-muted">{t("eta")}</div><div className="font-semibold">{fmtDate(o.supplierEtaDate, locale) || "—"}</div></div>
        <div><div className="text-[12px] text-ink-muted">{t("confirmedBy")}</div><div className="min-w-0 break-words font-semibold">{o.supplierConfirmedByName ? `${o.supplierConfirmedByName} · ${fmtDate(o.supplierConfirmedAt, locale)}` : "—"}</div></div>
      </section>

      <form action={confirmOrderAction} className="grid min-w-0 gap-4">
        <input type="hidden" name="id" value={o.id} />
        <input type="hidden" name="key" value={key} />
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="bg-surface-sunk text-left text-[12px] uppercase tracking-wide text-ink-2">
                <th className="p-3 font-semibold">{t("item")}</th>
                <th className="p-3 text-right font-semibold">{t("qty")}</th>
                <th className="p-3 text-right font-semibold">{t("receivedQty")}</th>
                {showPrice && <th className="p-3 text-right font-semibold">{t("unitPrice")}</th>}
                {showPrice && <th className="p-3 text-right font-semibold">{t("lineAmount")}</th>}
                <th className="p-3 font-semibold">{t("lineEta")}</th>
              </tr>
            </thead>
            <tbody>
              {o.lines.map((l) => (
                <tr key={l.id} className="border-t border-line align-top">
                  <td className="p-3"><div className="min-w-0 break-words font-semibold">{l.name}</div>{l.code && <div className="text-[12px] text-ink-muted">{l.code}</div>}</td>
                  <td className="p-3 text-right tabular-nums">{l.qty} {l.unit}</td>
                  <td className="p-3 text-right tabular-nums">{l.receivedQty}</td>
                  {showPrice && (
                    <td className="p-3 text-right tabular-nums">
                      {l.unitPrice !== undefined ? money(l.unitPrice) : ""}
                      {l.priceChanged && <div className="text-[12px] text-warn-fg">{t("was", { price: money(l.priceChanged.from) })}</div>}
                    </td>
                  )}
                  {showPrice && <td className="p-3 text-right tabular-nums">{l.lineAmount !== undefined ? money(l.lineAmount) : ""}</td>}
                  <td className="p-3">
                    {canConfirm
                      ? <input type="date" name={`line_${l.id}`} defaultValue={l.supplierEtaDate?.slice(0, 10) ?? ""} aria-label={t("lineEta")} className="input py-1.5 text-[13px]" />
                      : fmtDate(l.supplierEtaDate, locale) || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showPrice && o.total !== undefined && (
          <section className="card ml-auto grid w-full gap-1 p-4 sm:max-w-sm">
            <div className="flex justify-between gap-3"><span className="text-ink-2">{t("total")}{o.vatRate ? ` (VAT ${o.vatRate}%)` : ""}</span><b className="tabular-nums">{fmtMoney(o.total, "VND", locale)}</b></div>
            <div className="flex justify-between gap-3"><span className="text-ink-2">{t("paid")}</span><span className="tabular-nums">{fmtMoney(o.totalPaid ?? 0, "VND", locale)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-ink-2">{t("remaining")}</span><b className="tabular-nums">{fmtMoney(o.totalRemaining ?? 0, "VND", locale)}</b></div>
          </section>
        )}

        {canConfirm && (
          <section className="card grid gap-3 p-4 sm:grid-cols-[200px_1fr_auto] sm:items-end">
            <label className="field">{t("orderEta")}<input type="date" name="etaDate" defaultValue={o.supplierEtaDate?.slice(0, 10) ?? o.expectedDeliveryDate?.slice(0, 10) ?? ""} className="input" /></label>
            <label className="field">{t("note")}<input name="note" maxLength={500} className="input" /></label>
            <button type="submit" className="btn-primary">{t("confirm")}</button>
            <p className="text-[12px] font-normal text-ink-muted sm:col-span-3">{t("confirmHint")}</p>
          </section>
        )}
      </form>

      {canWrite && (
        <form action={subVendorAction} className="card grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <input type="hidden" name="id" value={o.id} />
          <input type="hidden" name="key" value={`${key}-sv`} />
          <label className="field">{t("subVendor")}<input name="subVendorName" defaultValue={o.subVendorName ?? ""} maxLength={200} className="input" /></label>
          <button type="submit" className="btn-secondary">{t("save")}</button>
        </form>
      )}

      {o.payments && o.payments.length > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="p-4 pb-0 text-[15px] font-bold">{t("payments")}</h2>
          <table className="w-full min-w-[480px] border-collapse">
            <tbody>
              {o.payments.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="p-3">{fmtDate(p.paidAt ?? p.scheduledAt, locale) || "—"}</td>
                  <td className="p-3 text-right tabular-nums">{fmtMoney(p.amount, "VND", locale)}</td>
                  <td className="p-3">{t(`payStatus.${p.status === "DA_THANH_TOAN" ? "paid" : "planned"}`)}</td>
                  <td className="min-w-0 break-words p-3 text-ink-2">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {can(me.role, "docs.view") && <DocsBlock me={me} entityType="PURCHASE_ORDER" entityId={o.id} back={`/don-mua/${o.id}`} dok={sp.dok} derr={sp.derr} />}
    </div>
  );
}
