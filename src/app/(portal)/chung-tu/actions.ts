"use server";

import { redirect } from "next/navigation";
import { CrmError } from "@/server/crmClient";
import { DOC_TYPES, deleteDoc, uploadDoc } from "@/server/crmClaims";
import { requirePerm } from "@/server/session";
import { checkUpload, UploadRejected } from "@/server/scan";

/** Chi cho quay lai cac man noi bo cua cong (chong open-redirect). */
function safeBack(raw: unknown): string {
  const s = String(raw ?? "");
  return /^\/(don-mua\/\d+|khieu-nai\/\d+|chung-tu)(\?[\w=&%-]*)?$/.test(s) ? s : "/chung-tu";
}
function go(path: string, kind: "ok" | "err", msg: string): never {
  const base = path.split("?")[0];
  const q = path.includes("?") ? path.split("?")[1] + "&" : "";
  redirect(`${base}?${q}d${kind}=${encodeURIComponent(msg)}`); // dok/derr: khong dung ten voi ok/err cua trang chu
}
function errCode(e: unknown): string {
  if (e instanceof CrmError) {
    if (e.code === "CRM_UNAVAILABLE") return "unavailable";
    if (e.code === "SUPPLIER_SUSPENDED") return "suspended";
    if (e.status === 404) return "notFound";
    if (e.status === 413) return "size";
    if (e.status === 422 || e.status === 400) return "invalid";
  }
  return "failed";
}

/** Tai chung tu len: cong kiem duoi/dung luong/byte dau/virus (scan.ts) roi chuyen sang CRM (CRM kiem lai). Quyen `docs.upload` o may chu. */
export async function uploadDocAction(formData: FormData): Promise<void> {
  const me = await requirePerm("docs.upload");
  const back = safeBack(formData.get("back"));
  const entityType = String(formData.get("entityType") ?? "");
  const entityId = Number(formData.get("entityId"));
  const docType = String(formData.get("docType") ?? "KHAC");
  const file = formData.get("file");
  if (!["PURCHASE_ORDER", "CLAIM"].includes(entityType) || !Number.isInteger(entityId) || entityId <= 0) go(back, "err", "invalid");
  if (!(DOC_TYPES as readonly string[]).includes(docType)) go(back, "err", "invalid");
  if (!(file instanceof File) || file.size === 0) go(back, "err", "noFile");
  try {
    const { buf } = await checkUpload(file as File);
    const out = new FormData();
    out.set("file", new File([new Uint8Array(buf)], (file as File).name, { type: (file as File).type }));
    out.set("entityType", entityType); out.set("entityId", String(entityId)); out.set("docType", docType);
    await uploadDoc(me, out, String(formData.get("key") ?? "") || crypto.randomUUID());
  } catch (e) {
    if (e instanceof UploadRejected) go(back, "err", `up_${e.code}`);
    go(back, "err", errCode(e));
  }
  go(back, "ok", "uploaded");
}

/** Go chung tu (xoa mem o CRM). Quyen `docs.upload`. */
export async function deleteDocAction(formData: FormData): Promise<void> {
  const me = await requirePerm("docs.upload");
  const back = safeBack(formData.get("back"));
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) go(back, "err", "invalid");
  try {
    await deleteDoc(me, id, String(formData.get("key") ?? "") || crypto.randomUUID());
  } catch (e) {
    go(back, "err", errCode(e));
  }
  go(back, "ok", "deleted");
}
