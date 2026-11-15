"use server";

import { redirect } from "next/navigation";
import { CrmError } from "@/server/crmClient";
import { respondClaim } from "@/server/crmClaims";
import { requirePerm } from "@/server/session";

function back(id: number, kind: "ok" | "err", msg: string): never {
  redirect(`/khieu-nai/${id}?${kind}=${encodeURIComponent(msg)}`);
}

/** NCC phan hoi khieu nai (ghi vao supplierResponseNote o CRM). Quyen `claims.respond` kiem o may chu; Idempotency-Key tu o an cua form. */
export async function respondClaimAction(formData: FormData): Promise<void> {
  const me = await requirePerm("claims.respond");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) redirect("/khieu-nai");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) back(id, "err", "needNote");
  if (note.length > 2000) back(id, "err", "tooLong");
  try {
    await respondClaim(me, id, note, String(formData.get("key") ?? "") || crypto.randomUUID());
  } catch (e) {
    if (e instanceof CrmError) {
      if (e.code === "CLAIM_STATE") back(id, "err", "closed");
      if (e.code === "CRM_UNAVAILABLE") back(id, "err", "unavailable");
      if (e.code === "SUPPLIER_SUSPENDED") back(id, "err", "suspended");
      if (e.status === 404) back(id, "err", "notFound");
    }
    back(id, "err", "failed");
  }
  back(id, "ok", "responded");
}
