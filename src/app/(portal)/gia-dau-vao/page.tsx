import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { can } from "@/server/permissions";
import { CrmError } from "@/server/crmClient";
import { listSubVendors, type SubVendorRow } from "@/server/crmCosts";
import { requirePerm } from "@/server/session";
import { fmtMoney } from "../don-mua/format";
import { createSubVendorAction } from "./actions";

/** NCC-05-01 Gia dau vao: danh sach NCC thu cap cua cong ty (mockup man 7). Du lieu rieng cua NCC, Hoa Huy khong doc. */
export default async function CostsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requirePerm("costs.view");
  const t = await getTranslations("costs");
  const locale = await getLocale();
  const sp = await searchParams;
  let rows: SubVendorRow[] = [];
  let failed = false;
  try { rows = await listSubVendors(me); } catch (e) { failed = true; if (!(e instanceof CrmError)) throw e; }
  const canEdit = can(me.role, "costs.edit");
  const key = crypto.randomUUID();

  return (
    <div className="grid min-w-0 gap-4">
      <div><div className="text-[11px] tracking-wider text-ink-muted">{t("code")}</div><h1 className="text-[20px] font-bold">{t("title")}</h1></div>
      <p className="rounded-lg border border-info-bg bg-info-bg px-3 py-2 text-info-fg">{t("private")}</p>
      {failed && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t("unavailable")}</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-ok-fg">{t(`ok.${sp.ok}` as never)}</p>}
      {sp.err && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t(`err.${sp.err}` as never)}</p>}

      {canEdit && (
        <form action={createSubVendorAction} className="card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_160px_auto] sm:items-end">
          <input type="hidden" name="key" value={key} />
          <label className="field">{t("name")}<input name="name" required maxLength={200} className="input" /></label>
          <label className="field">{t("contact")}<input name="contactName" maxLength={200} className="input" /></label>
          <label className="field">{t("phone")}<input name="phone" maxLength={50} inputMode="tel" className="input" /></label>
          <button type="submit" className="btn-primary">{t("add")}</button>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse">
          <thead>
            <tr className="bg-surface-sunk text-left text-[12px] uppercase tracking-wide text-ink-2">
              <th className="p-3 font-semibold">{t("name")}</th><th className="p-3 font-semibold">{t("contact")}</th>
              <th className="p-3 font-semibold">{t("phone")}</th><th className="p-3 text-right font-semibold">{t("debt")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="min-w-0 break-words p-3 font-semibold"><Link href={`/gia-dau-vao/${r.id}`}>{r.name}</Link></td>
                <td className="min-w-0 break-words p-3">{r.contactName || "—"}</td>
                <td className="p-3">{r.phone || "—"}</td>
                <td className="p-3 text-right tabular-nums">{fmtMoney(r.debt, "VND", locale)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-ink-muted">{t("empty")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
