import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CrmError } from "@/server/crmClient";
import { listClaims, type ClaimRow } from "@/server/crmClaims";
import { requirePerm } from "@/server/session";
import { fmtDate } from "../don-mua/format";
import { CLAIM_CHIP } from "./badge";

/** NCC-07-01 Khieu nai va chat luong: chi khieu nai Mua hang da chia se voi NCC nay. */
export default async function ClaimsPage() {
  const me = await requirePerm("claims.view");
  const t = await getTranslations("claims");
  const locale = await getLocale();
  let rows: ClaimRow[] = [];
  let failed = false;
  try { rows = await listClaims(me); } catch (e) { failed = true; if (!(e instanceof CrmError)) throw e; }
  const waiting = rows.filter((r) => !r.responded && (r.status === "REQUESTED" || r.status === "SUPPLIER_CONFIRMED")).length;

  return (
    <div className="grid min-w-0 gap-4">
      <div><div className="text-[11px] tracking-wider text-ink-muted">{t("code")}</div><h1 className="text-[20px] font-bold">{t("title")}</h1></div>
      <p className="rounded-lg border border-info-bg bg-info-bg px-3 py-2 text-info-fg">{t("source")}</p>
      {failed && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t("unavailable")}</p>}
      {waiting > 0 && <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-warn-fg">{t("waiting", { count: waiting })}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="bg-surface-sunk text-left text-[12px] uppercase tracking-wide text-ink-2">
              <th className="p-3 font-semibold">{t("claim")}</th><th className="p-3 font-semibold">{t("subject")}</th><th className="p-3 font-semibold">{t("type")}</th>
              <th className="p-3 text-right font-semibold">{t("qty")}</th><th className="p-3 font-semibold">{t("requestedAt")}</th><th className="p-3 font-semibold">{t("statusCol")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="p-3 font-semibold"><Link href={`/khieu-nai/${r.id}`}>#{r.id}</Link></td>
                <td className="min-w-0 break-words p-3">{r.subject ?? "—"}{r.lotOrSerial && <div className="text-[12px] text-ink-muted">{r.lotOrSerial}</div>}</td>
                <td className="p-3">{t(`claimType.${r.claimType}` as never)}</td>
                <td className="p-3 text-right tabular-nums">{r.quantity ?? "—"} {r.unit ?? ""}</td>
                <td className="p-3">{fmtDate(r.requestedAt, locale)}</td>
                <td className="p-3">
                  <span className={`chip ${CLAIM_CHIP[r.status] ?? "bg-done-bg text-done-fg"}`}>{t(`status.${r.status}` as never)}</span>
                  {r.responded && <span className="chip ml-1.5 bg-ok-bg text-ok-fg">{t("respondedTag")}</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-ink-muted">{t("empty")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
