import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CrmError } from "@/server/crmClient";
import { listRfqs, type RfqRow } from "@/server/crmRfq";
import { requirePerm } from "@/server/session";
import { fmtDate } from "../don-mua/format";
import { rfqBadge } from "./badge";

/** NCC-03-01 Yeu cau bao gia (mockup man 5). */
export default async function RfqListPage() {
  const me = await requirePerm("rfq.view");
  const t = await getTranslations("rfq");
  const locale = await getLocale();
  let rows: RfqRow[] = [];
  let failed = false;
  try { rows = await listRfqs(me); } catch (e) { failed = true; if (!(e instanceof CrmError)) throw e; }
  const open = rows.filter((r) => r.status === "DA_GUI" && !r.submitted && new Date(r.dueAt).getTime() > Date.now()).length;

  return (
    <div className="grid min-w-0 gap-4">
      <div><div className="text-[11px] tracking-wider text-ink-muted">{t("code")}</div><h1 className="text-[20px] font-bold">{t("title")}</h1></div>
      {failed && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t("unavailable")}</p>}
      {open > 0 && <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-warn-fg">{t("waiting", { count: open })}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="bg-surface-sunk text-left text-[12px] uppercase tracking-wide text-ink-2">
              <th className="p-3 font-semibold">{t("rfq")}</th>
              <th className="p-3 font-semibold">{t("items")}</th>
              <th className="p-3 font-semibold">{t("due")}</th>
              <th className="p-3 font-semibold">{t("statusCol")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const b = rfqBadge(r);
              return (
                <tr key={r.rfqId} className="border-t border-line">
                  <td className="p-3 font-semibold"><Link href={`/bao-gia/${r.rfqId}`}>{r.code}</Link></td>
                  <td className="min-w-0 break-words p-3">{r.firstLineLabel}{r.extraLineCount > 0 && <span className="text-ink-muted"> {t("more", { count: r.extraLineCount })}</span>}</td>
                  <td className="p-3">{fmtDate(r.dueAt, locale)}</td>
                  <td className="p-3"><span className={`chip ${b.cls}`}>{t(`badge.${b.key}` as never)}</span></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-ink-muted">{t("empty")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
