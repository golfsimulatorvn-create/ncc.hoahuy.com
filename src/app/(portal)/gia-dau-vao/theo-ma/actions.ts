"use server";

import { redirect } from "next/navigation";
import { CrmError } from "@/server/crmClient";
import { saveItemCosts, type ItemCostSave } from "@/server/crmItemCosts";
import { createSubVendor } from "@/server/crmCosts";
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
  for (const k of ["q", "missing", "page", "ncc"]) { const v = String(f.get(`ret_${k}`) ?? ""); if (v) keep.set(k, v); }
  const n = Math.min(Number(f.get("count")) || 0, 1000);
  const items: ItemCostSave[] = [];
  for (let i = 0; i < n; i++) {
    const code = String(f.get(`c_${i}`) ?? "").trim();
    const raw = String(f.get(`p_${i}`) ?? "");
    const orig = String(f.get(`o_${i}`) ?? "");
    const currency = String(f.get(`cur_${i}`) ?? "VND").toUpperCase();
    const origCur = String(f.get(`oc_${i}`) ?? "VND").toUpperCase();
    if (!code) continue;
    // Chi gui phan DA DOI: gia/tien te va/hoac NCC thu cap (specs/068).
    const priceChanged = !(raw.trim() === orig.trim() && currency === origCur);
    const sRaw = String(f.get(`s_${i}`) ?? "").trim();
    const subChanged = f.has(`s_${i}`) && sRaw !== String(f.get(`os_${i}`) ?? "").trim();
    if (!priceChanged && !subChanged) continue;
    const item: ItemCostSave = { code };
    if (priceChanged) {
      const v = parseMoney(raw);
      if (v !== null && (!Number.isFinite(v) || v < 0)) back(keep, "err", "invalid");
      item.unitCost = v;
      item.currency = currency;
    }
    if (subChanged) {
      const n = Number(sRaw);
      if (sRaw !== "" && (!Number.isInteger(n) || n <= 0)) back(keep, "err", "invalid");
      item.subVendorId = sRaw === "" ? null : n;
    }
    items.push(item);
  }
  if (items.length === 0) back(keep, "ok", "nochange");
  try {
    await saveItemCosts(me, items, String(f.get("key") ?? "") || crypto.randomUUID());
  } catch (e) {
    if (e instanceof CrmError) {
      if (e.code === "CRM_UNAVAILABLE") back(keep, "err", "unavailable");
      if (e.code === "SUPPLIER_SUSPENDED") back(keep, "err", "suspended");
      if (e.code === "BATCH_TOO_LARGE") back(keep, "err", "tooMany");
      if (e.code === "SUBVENDOR_NOT_FOUND") back(keep, "err", "subVendorGone");
      if (e.status === 404 || e.status === 400 || e.status === 422) back(keep, "err", "invalid");
    }
    back(keep, "err", "failed");
  }
  back(keep, "ok", "costSaved");
}

/** Them nhanh NCC thu cap ngay tai tab theo ma (specs/068): chi can ten; quay lai dung bo loc dang xem. */
export async function quickAddSubVendorAction(f: FormData): Promise<void> {
  const me = await requirePerm("costs.edit");
  const keep = new URLSearchParams();
  for (const k of ["q", "missing", "page", "ncc"]) { const v = String(f.get(`ret_${k}`) ?? ""); if (v) keep.set(k, v); }
  const name = String(f.get("name") ?? "").trim().slice(0, 200);
  if (!name) back(keep, "err", "invalid");
  const contact = String(f.get("contactName") ?? "").trim().slice(0, 200);
  try {
    await createSubVendor(me, { name, contactName: contact || null }, String(f.get("key") ?? "") || crypto.randomUUID());
  } catch (e) {
    if (e instanceof CrmError) {
      if (e.code === "CRM_UNAVAILABLE") back(keep, "err", "unavailable");
      if (e.code === "SUPPLIER_SUSPENDED") back(keep, "err", "suspended");
      if (e.status === 400 || e.status === 422) back(keep, "err", "invalid");
    }
    back(keep, "err", "failed");
  }
  back(keep, "ok", "subVendorAdded");
}
