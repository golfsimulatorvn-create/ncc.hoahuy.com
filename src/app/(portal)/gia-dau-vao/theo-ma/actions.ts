"use server";

import { redirect } from "next/navigation";
import { CrmError } from "@/server/crmClient";
import { saveItemCosts } from "@/server/crmItemCosts";
import { parseMoney } from "@/server/parseMoney";
import { requirePerm } from "@/server/session";

function back(params: URLSearchParams, kind: "ok" | "err", msg: string): never {
  params.delete("ok"); params.delete("err");
  params.set(kind, msg);
  redirect(`/gia-dau-vao/theo-ma?${params.toString()}`);
}

/** Luu gia dau vao theo lo: chi gui cac dong DA DOI so voi luc mo trang (o rong + truoc do co gia = bo gia). */
export async function saveItemCostsAction(f: FormData): Promise<void> {
  const me = await requirePerm("costs.edit");
  const keep = new URLSearchParams();
  for (const k of ["q", "missing", "page"]) { const v = String(f.get(`ret_${k}`) ?? ""); if (v) keep.set(k, v); }
  const n = Math.min(Number(f.get("count")) || 0, 1000);
  const items: { code: string; unitCost: number | null; currency: string }[] = [];
  for (let i = 0; i < n; i++) {
    const code = String(f.get(`c_${i}`) ?? "").trim();
    const raw = String(f.get(`p_${i}`) ?? "");
    const orig = String(f.get(`o_${i}`) ?? "");
    const currency = String(f.get(`cur_${i}`) ?? "VND").toUpperCase();
    const origCur = String(f.get(`oc_${i}`) ?? "VND").toUpperCase();
    if (!code) continue;
    if (raw.trim() === orig.trim() && currency === origCur) continue;
    const v = parseMoney(raw);
    if (v !== null && (!Number.isFinite(v) || v < 0)) back(keep, "err", "invalid");
    items.push({ code, unitCost: v, currency });
  }
  if (items.length === 0) back(keep, "ok", "nochange");
  try {
    await saveItemCosts(me, items, String(f.get("key") ?? "") || crypto.randomUUID());
  } catch (e) {
    if (e instanceof CrmError) {
      if (e.code === "CRM_UNAVAILABLE") back(keep, "err", "unavailable");
      if (e.code === "SUPPLIER_SUSPENDED") back(keep, "err", "suspended");
      if (e.code === "BATCH_TOO_LARGE") back(keep, "err", "tooMany");
      if (e.status === 404 || e.status === 400 || e.status === 422) back(keep, "err", "invalid");
    }
    back(keep, "err", "failed");
  }
  back(keep, "ok", "costSaved");
}
