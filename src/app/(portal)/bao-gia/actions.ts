"use server";

import { redirect } from "next/navigation";
import { CrmError } from "@/server/crmClient";
import { saveQuote } from "@/server/crmRfq";
import { requirePerm } from "@/server/session";

function back(id: number, kind: "ok" | "err", msg: string): never {
  redirect(`/bao-gia/${id}?${kind}=${encodeURIComponent(msg)}`);
}

/** Luu nhap / Nop bao gia. Quyen `rfq.quote` (chi Quan tri NCC) kiem o may chu; CRM kiem lai vai tro + han chot. */
async function quote(formData: FormData, submit: boolean): Promise<void> {
  const me = await requirePerm("rfq.quote");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) redirect("/bao-gia");
  const lines: { rfqLineId: number; unitPrice: number; leadTimeDays: number | null }[] = [];
  let emptyLines = 0;
  for (const [k, v] of formData.entries()) {
    const m = /^price_(\d+)$/.exec(k);
    if (!m) continue;
    if (!String(v).trim()) { emptyLines++; continue; }
    const price = Number(String(v).replace(/,/g, "."));
    if (!Number.isFinite(price) || price <= 0) back(id, "err", "invalid");
    const lead = String(formData.get(`lead_${m[1]}`) ?? "").trim();
    const days = lead === "" ? null : Number(lead);
    if (days !== null && (!Number.isInteger(days) || days < 0 || days > 3650)) back(id, "err", "invalid");
    lines.push({ rfqLineId: Number(m[1]), unitPrice: price, leadTimeDays: days });
  }
  if (lines.length === 0) back(id, "err", "needPrice");
  if (submit && emptyLines > 0) back(id, "err", "missing");
  try {
    await saveQuote(me, id, { submit, lines }, String(formData.get("key") ?? "") || crypto.randomUUID());
  } catch (e) {
    if (e instanceof CrmError) {
      if (e.code === "RFQ_STATE") back(id, "err", "closed");
      if (e.code === "CRM_UNAVAILABLE") back(id, "err", "unavailable");
      if (e.code === "SUPPLIER_SUSPENDED") back(id, "err", "suspended");
      if (e.status === 400 || e.status === 422) back(id, "err", "missing");
    }
    back(id, "err", "failed");
  }
  back(id, "ok", submit ? "submitted" : "draft");
}

export async function saveDraftAction(formData: FormData): Promise<void> {
  return quote(formData, false);
}

export async function submitQuoteAction(formData: FormData): Promise<void> {
  return quote(formData, true);
}
