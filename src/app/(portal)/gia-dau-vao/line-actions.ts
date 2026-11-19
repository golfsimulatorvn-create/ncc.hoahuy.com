"use server";

import { redirect } from "next/navigation";
import { CrmError } from "@/server/crmClient";
import { saveItemCosts } from "@/server/crmItemCosts";
import { parseMoney } from "@/server/parseMoney";
import { requirePerm } from "@/server/session";

/** Chi cho quay lai dung trang chi tiet don mua / bao gia RFQ (chong chuyen huong ra ngoai). */
function safeBack(raw: string): string {
  return /^\/(don-mua|bao-gia)\/\d+$/.test(raw) ? raw : "/gia-dau-vao/theo-ma";
}
function back(path: string, kind: "ok" | "err", msg: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
}

/** Luu gia dau vao ngay tren dong don mua / RFQ (specs/064 dot 2). Chi gui dong DA DOI; o rong sau khi co gia = bo gia. */
export async function saveLineCostsAction(f: FormData): Promise<void> {
  const me = await requirePerm("costs.edit");
  const path = safeBack(String(f.get("back") ?? ""));
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
    if (v !== null && (!Number.isFinite(v) || v < 0)) back(path, "err", "costInvalid");
    items.push({ code, unitCost: v, currency });
  }
  if (items.length === 0) back(path, "ok", "costNoChange");
  try {
    await saveItemCosts(me, items, String(f.get("key") ?? "") || crypto.randomUUID());
  } catch (e) {
    if (e instanceof CrmError) {
      if (e.code === "CRM_UNAVAILABLE") back(path, "err", "unavailable");
      if (e.code === "SUPPLIER_SUSPENDED") back(path, "err", "suspended");
      if (e.code === "BATCH_TOO_LARGE") back(path, "err", "costTooMany");
      if (e.status === 404 || e.status === 400 || e.status === 422) back(path, "err", "costInvalid");
    }
    back(path, "err", "failed");
  }
  back(path, "ok", "costSaved");
}
