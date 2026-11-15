import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DocsBlock } from "@/components/DocsBlock";
import { can } from "@/server/permissions";
import { CrmError } from "@/server/crmClient";
import { getClaim, type ClaimDetail } from "@/server/crmClaims";
import { requirePerm } from "@/server/session";
import { fmtDate } from "../../don-mua/format";
import { CLAIM_CHIP } from "../badge";
import { respondClaimAction } from "../actions";

/** NCC-07-02 Chi tiet khieu nai: xem, phan hoi, dinh kem chung tu. Khong co ghi chu noi bo cua Hoa Huy. */
export default async function ClaimDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; dok?: string; derr?: string }> }) {
  const me = await requirePerm("claims.view");
  const t = await getTranslations("claims");
  const locale = await getLocale();
  const { id } = await params;
  const sp = await searchParams;
  const cid = Number(id);
  if (!Number.isInteger(cid) || cid <= 0) notFound();

  let c: ClaimDetail;
  try {
    c = await getClaim(me, cid);
  } catch (e) {
    if (e instanceof CrmError && e.status === 404) notFound();
    if (e instanceof CrmError) return <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t("unavailable")}</p>;
    throw e;
  }
  const closed = c.status === "RESOLVED" || c.status === "REJECTED";
  const canRespond = can(me.role, "claims.respond") && !closed;
  const key = crypto.randomUUID();

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <div><div className="text-[11px] tracking-wider text-ink-muted"><Link href="/khieu-nai">{t("title")}</Link> · {t("code2")}</div><h1 className="text-[20px] font-bold">{t("claimNo", { id: c.id })}</h1></div>
        <span className={`chip ${CLAIM_CHIP[c.status] ?? "bg-done-bg text-done-fg"}`}>{t(`status.${c.status}` as never)}</span>
      </div>
      {sp.ok && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-ok-fg">{t(`ok.${sp.ok}` as never)}</p>}
      {sp.err && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t(`err.${sp.err}` as never)}</p>}

      <section className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0"><div className="text-[12px] text-ink-muted">{t("subject")}</div><div className="break-words font-semibold">{c.subject ?? "—"}</div></div>
        <div className="min-w-0"><div className="text-[12px] text-ink-muted">{t("lot")}</div><div className="break-words font-semibold">{c.lotOrSerial ?? "—"}</div></div>
        <div><div className="text-[12px] text-ink-muted">{t("type")}</div><div className="font-semibold">{t(`claimType.${c.claimType}` as never)}</div></div>
        <div><div className="text-[12px] text-ink-muted">{t("qty")}</div><div className="font-semibold tabular-nums">{c.quantity ?? "—"} {c.unit ?? ""}</div></div>
        <div><div className="text-[12px] text-ink-muted">{t("requestedAt")}</div><div className="font-semibold">{fmtDate(c.requestedAt, locale)}</div></div>
      </section>

      {c.sharedAttachments.length > 0 && (
        <section className="card grid gap-2 p-4">
          <h2 className="text-[15px] font-bold">{t("hhAttachments")}</h2>
          <ul className="grid gap-1">
            {c.sharedAttachments.map((a) => (
              <li key={a.id} className="min-w-0 break-words"><a href={`/tep/khieu-nai/${c.id}/${a.id}`} className="underline" download>{a.fileName}</a> <span className="text-[12px] text-ink-muted">{fmtDate(a.uploadedAt, locale)}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="card grid gap-3 p-4">
        <h2 className="text-[15px] font-bold">{t("response")}</h2>
        {c.supplierResponseNote && (
          <div className="rounded-lg bg-surface-sunk p-3">
            <p className="whitespace-pre-wrap break-words">{c.supplierResponseNote}</p>
            <p className="mt-1 text-[12px] text-ink-muted">{c.supplierRespondedByName} · {fmtDate(c.supplierRespondedAt, locale)}</p>
          </div>
        )}
        {!c.supplierResponseNote && <p className="text-ink-muted">{t("noResponse")}</p>}
        {closed && <p className="text-ink-muted">{t("closedHint")}</p>}
        {canRespond && (
          <form action={respondClaimAction} className="grid gap-3">
            <input type="hidden" name="id" value={c.id} /><input type="hidden" name="key" value={key} />
            <label className="field">{t("note")}<textarea name="note" rows={4} maxLength={2000} required className="input" placeholder={t("notePlaceholder")} /></label>
            <div><button type="submit" className="btn-primary">{t(c.supplierResponseNote ? "updateResponse" : "send")}</button></div>
          </form>
        )}
      </section>

      <DocsBlock me={me} entityType="CLAIM" entityId={c.id} back={`/khieu-nai/${c.id}`} dok={sp.dok} derr={sp.derr} />
    </div>
  );
}
