import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DocsBlock } from "@/components/DocsBlock";
import { CrmError } from "@/server/crmClient";
import { listOrders, type OrderRow } from "@/server/crmOrders";
import { requirePerm } from "@/server/session";
import { fmtDate } from "../don-mua/format";

/** NCC-08-01 Chung tu: chon don mua -> xem / tai len hoa don, packing list, chung tu giao hang. (Chung tu khieu nai nam o chi tiet khieu nai.) */
export default async function DocsPage({ searchParams }: { searchParams: Promise<{ don?: string; dok?: string; derr?: string }> }) {
  const me = await requirePerm("docs.view");
  const t = await getTranslations("docs");
  const locale = await getLocale();
  const sp = await searchParams;
  let orders: OrderRow[] = [];
  let failed = false;
  try { orders = (await listOrders(me)).filter((o) => o.status !== "CANCELLED"); } catch (e) { failed = true; if (!(e instanceof CrmError)) throw e; }
  const chosen = orders.find((o) => String(o.id) === sp.don) ?? orders[0] ?? null;

  return (
    <div className="grid min-w-0 gap-4">
      <div><div className="text-[11px] tracking-wider text-ink-muted">{t("code")}</div><h1 className="text-[20px] font-bold">{t("pageTitle")}</h1></div>
      {failed && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t("unavailable")}</p>}
      <form method="get" action="/chung-tu" className="card flex flex-wrap items-end gap-3 p-4">
        <label className="field min-w-0 flex-1 basis-64">{t("pickOrder")}
          <select name="don" defaultValue={chosen ? String(chosen.id) : ""} className="input">
            {orders.map((o) => <option key={o.id} value={o.id}>{o.code} · {fmtDate(o.orderDate, locale)}</option>)}
          </select>
        </label>
        <button type="submit" className="btn-secondary">{t("view")}</button>
        {chosen && <Link href={`/don-mua/${chosen.id}`} className="min-h-9 px-1 py-2 text-[13px] underline">{t("openOrder")}</Link>}
      </form>
      {chosen
        ? <DocsBlock me={me} entityType="PURCHASE_ORDER" entityId={chosen.id} back="/chung-tu" dok={sp.dok} derr={sp.derr} />
        : !failed && <p className="card p-6 text-center text-ink-muted">{t("noOrders")}</p>}
    </div>
  );
}
