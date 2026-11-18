import type { PortalUser } from "./session";
import { crmCall } from "./crmClient";
import { actorOf } from "./crmOrders";

/** API Gia dau vao theo ma hang cua CRM (specs/064). Du lieu RIENG cua NCC; gia ban + lai gop chi co khi CRM tra (Quan tri NCC). */
export type ItemCostRow = {
  code: string; name: string; unit: string; qtyOrdered: number; docCount: number;
  inputPrice: number | null; currency: string; note: string | null; updatedAt: string | null;
  sellPrice?: number | null; sellCurrency?: string | null; grossAmount?: number | null; grossPct?: number | null;
};
export type ItemCostList = { rows: ItemCostRow[]; total: number; totalCodes: number; missingCount: number; page: number; pageSize: number };
export type ItemCostHistoryRow = { at: string; from: number | null; to: number | null; currency: string; by: string | null };

export const listItemCosts = (u: PortalUser, q: { q?: string; missing?: boolean; page?: number }) => {
  const sp = new URLSearchParams();
  if (q.q) sp.set("q", q.q);
  if (q.missing) sp.set("missing", "1");
  if (q.page && q.page > 1) sp.set("page", String(q.page));
  const qs = sp.toString();
  return crmCall<ItemCostList>(actorOf(u), { path: `/api/supplier/item-costs${qs ? `?${qs}` : ""}` });
};
export const saveItemCosts = (u: PortalUser, items: { code: string; unitCost: number | null; currency?: string | null; note?: string | null }[], idempotencyKey: string) =>
  crmCall<{ changed: number }>(actorOf(u), { method: "PUT", path: "/api/supplier/item-costs", json: { items }, idempotencyKey });
export const getItemCostHistory = (u: PortalUser, code: string) =>
  crmCall<ItemCostHistoryRow[]>(actorOf(u), { path: `/api/supplier/item-costs/history?code=${encodeURIComponent(code)}` });
