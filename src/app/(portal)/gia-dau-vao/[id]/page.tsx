import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { can } from "@/server/permissions";
import { CrmError } from "@/server/crmClient";
import { getSubVendor, type SubVendorDetail } from "@/server/crmCosts";
import { requirePerm } from "@/server/session";
import { fmtDate, fmtMoney } from "../../don-mua/format";
import { addLedgerAction, archiveSubVendorAction, deletePriceItemAction, savePriceItemAction } from "../actions";

/** NCC-05-02 Chi tiet NCC thu cap: bang don gia mua vao + so cong no. COST_VIEWER chi doc; xoa chi Quan tri. */
export default async function SubVendorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; confirm?: string; n?: string; codes?: string }> }) {
  const me = await requirePerm("costs.view");
  const t = await getTranslations("costs");
  const locale = await getLocale();
  const { id } = await params;
  const sp = await searchParams;
  const sid = Number(id);
  if (!Number.isInteger(sid) || sid <= 0) notFound();

  let v: SubVendorDetail;
  try {
    v = await getSubVendor(me, sid);
  } catch (e) {
    if (e instanceof CrmError && (e.status === 404 || e.status === 400)) notFound();
    if (e instanceof CrmError) return <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t("unavailable")}</p>;
    throw e;
  }
  const canEdit = can(me.role, "costs.edit");
  const canDelete = can(me.role, "costs.delete");
  const key = crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <div><div className="text-[11px] tracking-wider text-ink-muted"><Link href="/gia-dau-vao">{t("title")}</Link> · {t("code2")}</div><h1 className="min-w-0 break-words text-[20px] font-bold">{v.name}</h1></div>
        <span className="text-ink-2">{[v.contactName, v.phone].filter(Boolean).join(" · ")}</span>
      </div>
      <p className="rounded-lg border border-info-bg bg-info-bg px-3 py-2 text-info-fg">{t("private")}</p>
      {sp.ok && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-ok-fg">{t(`ok.${sp.ok}` as never)}</p>}
      {sp.err && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t(`err.${sp.err}` as never)}</p>}

      <section className="card overflow-x-auto">
        <h2 className="p-4 pb-2 text-[15px] font-bold">{t("priceTable")}</h2>
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="bg-surface-sunk text-left text-[12px] uppercase tracking-wide text-ink-2">
              <th className="p-3 font-semibold">{t("itemName")}</th><th className="p-3 font-semibold">{t("unit")}</th>
              <th className="p-3 text-right font-semibold">{t("unitPrice")}</th><th className="p-3 font-semibold">{t("note")}</th>
              {canEdit && <th className="p-3 text-right font-semibold">{t("actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {v.priceItems.map((p) => (
              <tr key={p.id} className="border-t border-line align-top">
                {canEdit ? (
                  <>
                    <td colSpan={4} className="p-2">
                      <form action={savePriceItemAction} className="grid grid-cols-[1fr_80px_130px_1fr_auto] items-center gap-2 max-sm:grid-cols-2">
                        <input type="hidden" name="id" value={v.id} /><input type="hidden" name="itemId" value={p.id} /><input type="hidden" name="key" value={`${key}-p${p.id}`} />
                        <input name="itemName" defaultValue={p.itemName} required maxLength={300} aria-label={t("itemName")} className="input py-1.5" />
                        <input name="unit" defaultValue={p.unit} required maxLength={30} aria-label={t("unit")} className="input py-1.5" />
                        <input name="unitPrice" defaultValue={p.unitPrice} required inputMode="decimal" aria-label={t("unitPrice")} className="input py-1.5 text-right" />
                        <input name="note" defaultValue={p.note ?? ""} maxLength={500} aria-label={t("note")} className="input py-1.5" />
                        <button type="submit" className="btn-secondary min-h-9 px-3 py-1.5 text-[13px]">{t("save")}</button>
                      </form>
                    </td>
                    <td className="p-2 text-right">
                      {canDelete && (
                        <form action={deletePriceItemAction}>
                          <input type="hidden" name="id" value={v.id} /><input type="hidden" name="itemId" value={p.id} /><input type="hidden" name="key" value={`${key}-d${p.id}`} />
                          <button type="submit" className="btn-secondary min-h-9 px-3 py-1.5 text-[13px] text-danger-fg">{t("delete")}</button>
                        </form>
                      )}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="min-w-0 break-words p-3 font-semibold">{p.itemName}</td><td className="p-3">{p.unit}</td>
                    <td className="p-3 text-right tabular-nums">{fmtMoney(p.unitPrice, "VND", locale)}</td><td className="min-w-0 break-words p-3 text-ink-2">{p.note}</td>
                  </>
                )}
              </tr>
            ))}
            {v.priceItems.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-ink-muted">{t("emptyPrices")}</td></tr>}
          </tbody>
        </table>
        {canEdit && (
          <form action={savePriceItemAction} className="grid gap-2 border-t border-line p-3 sm:grid-cols-[1fr_80px_130px_1fr_auto] sm:items-end">
            <input type="hidden" name="id" value={v.id} /><input type="hidden" name="key" value={`${key}-new`} />
            <label className="field">{t("itemName")}<input name="itemName" required maxLength={300} className="input" /></label>
            <label className="field">{t("unit")}<input name="unit" required maxLength={30} className="input" /></label>
            <label className="field">{t("unitPrice")}<input name="unitPrice" required inputMode="decimal" className="input text-right" /></label>
            <label className="field">{t("note")}<input name="note" maxLength={500} className="input" /></label>
            <button type="submit" className="btn-primary">{t("addPrice")}</button>
          </form>
        )}
      </section>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-baseline justify-between gap-2 p-4 pb-2">
          <h2 className="text-[15px] font-bold">{t("ledger")}</h2>
          <div className="font-semibold">{t("debt")}: <span className="tabular-nums">{fmtMoney(v.debt, "VND", locale)}</span></div>
        </div>
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="bg-surface-sunk text-left text-[12px] uppercase tracking-wide text-ink-2">
              <th className="p-3 font-semibold">{t("date")}</th><th className="p-3 font-semibold">{t("description")}</th>
              <th className="p-3 text-right font-semibold">{t("debit")}</th><th className="p-3 text-right font-semibold">{t("credit")}</th>
              <th className="p-3 text-right font-semibold">{t("balance")}</th>
            </tr>
          </thead>
          <tbody>
            {v.ledger.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="p-3">{fmtDate(e.entryDate, locale)}</td>
                <td className="min-w-0 break-words p-3">{e.description}</td>
                <td className="p-3 text-right tabular-nums">{e.debitAmount ? fmtMoney(e.debitAmount, "VND", locale) : ""}</td>
                <td className="p-3 text-right tabular-nums">{e.creditAmount ? fmtMoney(e.creditAmount, "VND", locale) : ""}</td>
                <td className="p-3 text-right tabular-nums">{fmtMoney(e.balance, "VND", locale)}</td>
              </tr>
            ))}
            {v.ledger.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-ink-muted">{t("emptyLedger")}</td></tr>}
          </tbody>
        </table>
        {canEdit && (
          <form action={addLedgerAction} className="grid gap-2 border-t border-line p-3 sm:grid-cols-[140px_1fr_130px_130px_auto] sm:items-end">
            <input type="hidden" name="id" value={v.id} /><input type="hidden" name="key" value={`${key}-led`} />
            <label className="field">{t("date")}<input name="entryDate" type="date" required defaultValue={today} className="input" /></label>
            <label className="field">{t("description")}<input name="description" required maxLength={500} className="input" /></label>
            <label className="field">{t("debit")}<input name="debitAmount" inputMode="decimal" className="input text-right" /></label>
            <label className="field">{t("credit")}<input name="creditAmount" inputMode="decimal" className="input text-right" /></label>
            <button type="submit" className="btn-primary">{t("addLedger")}</button>
            <p className="text-[12px] text-ink-muted sm:col-span-5">{t("ledgerHint")}</p>
          </form>
        )}
      </section>

      {canDelete && sp.confirm === "unassign" && (
        <form action={archiveSubVendorAction} className="card grid gap-3 border-warn-fg p-4" role="alertdialog" aria-label={t("unassign.title")} data-testid="unassign-confirm">
          <input type="hidden" name="id" value={v.id} /><input type="hidden" name="key" value={`${key}-unassign`} /><input type="hidden" name="unassign" value="1" />
          <h2 className="text-[15px] font-bold">{t("unassign.title")}</h2>
          <p>{t("unassign.body", { name: v.name, count: Math.max(0, Number(sp.n) || 0) })}</p>
          <ul className="grid gap-0.5 rounded-lg bg-surface-sunk px-3 py-2 text-[13px]">
            {(sp.codes ?? "").split(",").filter(Boolean).slice(0, 20).map((c) => <li key={c}>{c}</li>)}
          </ul>
          <p className="rounded-lg bg-warn-bg px-3 py-2 text-warn-fg">{t("unassign.effect")}</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href={`/gia-dau-vao/${v.id}`} className="btn-secondary">{t("unassign.cancel")}</Link>
            <button type="submit" className="btn-primary" data-testid="unassign-go">{t("unassign.go", { count: Math.max(0, Number(sp.n) || 0) })}</button>
          </div>
        </form>
      )}

      {canDelete && (
        <form action={archiveSubVendorAction} className="card flex flex-wrap items-center gap-3 p-4">
          <input type="hidden" name="id" value={v.id} /><input type="hidden" name="key" value={`${key}-arch`} />
          <p className="min-w-0 flex-1 text-ink-2">{t("archiveHint")}</p>
          <button type="submit" className="btn-secondary text-danger-fg">{t("archive")}</button>
        </form>
      )}
    </div>
  );
}
