import type { PortalUser } from "./session";
import { crmCall, crmCallFull } from "./crmClient";
import { actorOf } from "./crmOrders";

/** API Gia dau vao theo ma hang cua CRM (specs/064). Du lieu RIENG cua NCC; gia ban + lai gop chi co khi CRM tra (Quan tri NCC). */
export type ItemCostRow = {
  code: string; name: string; unit: string; qtyOrdered: number; docCount: number;
  inputPrice: number | null; currency: string; note: string | null; updatedAt: string | null;
  sellPrice?: number | null; sellCurrency?: string | null; grossAmount?: number | null; grossPct?: number | null;
  /** NCC thu cap mac dinh cua ma (specs/068): luon co khoa voi vai tro xem duoc gia von; null = chua chon. */
  subVendorId?: number | null; subVendorName?: string | null; subVendorActive?: boolean | null;
};
export type SubVendorOption = { id: number; name: string; active: boolean; assignedCount: number };
export type ItemCostList = { rows: ItemCostRow[]; total: number; totalCodes: number; missingCount: number; page: number; pageSize: number; subVendors?: SubVendorOption[] };
export type ItemCostHistoryRow = { at: string; from: number | null; to: number | null; currency: string; by: string | null };
export type SubVendorHistoryRow = { at: string; fromId: number | null; fromName: string | null; toId: number | null; toName: string | null; by: string | null };

export const listItemCosts = (u: PortalUser, q: { q?: string; missing?: boolean; page?: number; subVendor?: number | "none" }) => {
  const sp = new URLSearchParams();
  if (q.q) sp.set("q", q.q);
  if (q.missing) sp.set("missing", "1");
  if (q.subVendor !== undefined) sp.set("nccThuCap", String(q.subVendor));
  if (q.page && q.page > 1) sp.set("page", String(q.page));
  const qs = sp.toString();
  return crmCall<ItemCostList>(actorOf(u), { path: `/api/supplier/item-costs${qs ? `?${qs}` : ""}` });
};
/** unitCost vang = khong dung gia; subVendorId vang = giu NCC, null = bo gan, so = gan (specs/068). */
export type ItemCostSave = { code: string; unitCost?: number | null; currency?: string | null; note?: string | null; subVendorId?: number | null };
export const saveItemCosts = (u: PortalUser, items: ItemCostSave[], idempotencyKey: string) =>
  crmCall<{ changed: number }>(actorOf(u), { method: "PUT", path: "/api/supplier/item-costs", json: { items }, idempotencyKey });
export const getItemCostHistory = (u: PortalUser, code: string) =>
  crmCall<ItemCostHistoryRow[]>(actorOf(u), { path: `/api/supplier/item-costs/history?code=${encodeURIComponent(code)}` });
/** Lich su gia + lich su doi NCC thu cap cua mot ma (specs/068). CRM cu chua co subVendorHistory thi tra mang rong. */
export const getItemCostFullHistory = async (u: PortalUser, code: string) => {
  const r = await crmCallFull<ItemCostHistoryRow[], { subVendorHistory?: SubVendorHistoryRow[] }>(actorOf(u), { path: `/api/supplier/item-costs/history?code=${encodeURIComponent(code)}` });
  return { price: r.data, subVendor: r.subVendorHistory ?? [] };
};
