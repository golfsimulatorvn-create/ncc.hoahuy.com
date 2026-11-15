import { getLocale, getTranslations } from "next-intl/server";
import { can } from "@/server/permissions";
import { CrmError } from "@/server/crmClient";
import { DOC_TYPES, listDocs, type DocEntity, type DocRow } from "@/server/crmClaims";
import type { PortalUser } from "@/server/session";
import { deleteDocAction, uploadDocAction } from "@/app/(portal)/chung-tu/actions";
import { fmtDate } from "@/app/(portal)/don-mua/format";

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Khoi Chung tu dung chung (chi tiet don mua, chi tiet khieu nai, man Chung tu): danh sach + tai len + go. dok/derr = thong bao cua khoi. */
export async function DocsBlock({ me, entityType, entityId, back, dok, derr }: {
  me: PortalUser; entityType: DocEntity; entityId: number; back: string; dok?: string; derr?: string;
}) {
  const t = await getTranslations("docs");
  const locale = await getLocale();
  let rows: DocRow[] = [];
  let failed = false;
  try { rows = await listDocs(me, entityType, entityId); } catch (e) { failed = true; if (!(e instanceof CrmError)) throw e; }
  const canUpload = can(me.role, "docs.upload");
  const key = crypto.randomUUID();
  const types = entityType === "CLAIM" ? DOC_TYPES : DOC_TYPES.filter((x) => x !== "PHAN_HOI");

  return (
    <section className="card grid min-w-0 gap-3 p-4" aria-labelledby={`docs-${entityType}-${entityId}`}>
      <h2 id={`docs-${entityType}-${entityId}`} className="text-[15px] font-bold">{t("title")}</h2>
      {dok && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-ok-fg">{t(`ok.${dok}` as never)}</p>}
      {derr && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t(`err.${derr}` as never)}</p>}
      {failed && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t("unavailable")}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-line align-top first:border-t-0">
                <td className="min-w-0 break-words p-2"><a href={`/tep/chung-tu/${d.id}`} className="font-semibold underline" download>{d.fileName}</a><div className="text-[12px] text-ink-muted">{fmtSize(d.sizeBytes)}</div></td>
                <td className="p-2"><span className="chip bg-info-bg text-info-fg">{t(`type.${d.docType}` as never)}</span></td>
                <td className="p-2 text-[12px] text-ink-muted">{d.uploadedByName} · {fmtDate(d.createdAt, locale)}</td>
                <td className="p-2 text-right">
                  {canUpload && (
                    <form action={deleteDocAction}>
                      <input type="hidden" name="id" value={d.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="key" value={`${key}-d${d.id}`} />
                      <button type="submit" className="btn-secondary min-h-9 px-3 py-1.5 text-[13px]">{t("remove")}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="p-4 text-center text-ink-muted">{t("empty")}</td></tr>}
          </tbody>
        </table>
      </div>
      {canUpload && (
        <form action={uploadDocAction} encType="multipart/form-data" className="grid min-w-0 gap-3 border-t border-line pt-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
          <input type="hidden" name="entityType" value={entityType} /><input type="hidden" name="entityId" value={entityId} />
          <input type="hidden" name="back" value={back} /><input type="hidden" name="key" value={key} />
          <label className="field">{t("docType")}
            <select name="docType" className="input" defaultValue={types[0]}>{types.map((x) => <option key={x} value={x}>{t(`type.${x}` as never)}</option>)}</select>
          </label>
          <label className="field">{t("file")}<input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv" className="input" /></label>
          <button type="submit" className="btn-primary">{t("upload")}</button>
          <p className="text-[12px] text-ink-muted sm:col-span-3">{t("hint")}</p>
        </form>
      )}
    </section>
  );
}
