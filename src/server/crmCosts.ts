import type { PortalUser } from "./session";
import { crmCall } from "./crmClient";
import { actorOf } from "./crmOrders";

/** API Gia dau vao (NCC thu cap) cua CRM (specs/054, T072). Du lieu RIENG cua NCC: Hoa Huy khong doc, khong co buoc duyet. */
export type SubVendorRow = { id: number; name: string; contactName: string | null; phone: string | null; isActive: boolean; debt: number };
export type SubVendorDetail = {
  id: number; name: string; contactName: string | null; phone: string | null; note: string | null; isActive: boolean; debt: number;
  priceItems: { id: number; itemName: string; unit: string; unitPrice: number; note: string | null; updatedAt: string }[];
  ledger: { id: number; entryDate: string; description: string; debitAmount: number; creditAmount: number; note: string | null; balance: number }[];
};

export const listSubVendors = (u: PortalUser) => crmCall<SubVendorRow[]>(actorOf(u), { path: "/api/supplier/sub-vendors" });
export const getSubVendor = (u: PortalUser, id: number) => crmCall<SubVendorDetail>(actorOf(u), { path: `/api/supplier/sub-vendors/${id}` });
export const createSubVendor = (u: PortalUser, body: { name: string; contactName?: string | null; phone?: string | null; note?: string | null }, key: string) =>
  crmCall<{ id: number }>(actorOf(u), { method: "POST", path: "/api/supplier/sub-vendors", json: body, idempotencyKey: key });
export const archiveSubVendor = (u: PortalUser, id: number, key: string) =>
  crmCall(actorOf(u), { method: "DELETE", path: `/api/supplier/sub-vendors/${id}`, idempotencyKey: key });
export const savePriceItem = (u: PortalUser, id: number, body: { id?: number | null; itemName: string; unit: string; unitPrice: number; note?: string | null }, key: string) =>
  crmCall(actorOf(u), { method: "PUT", path: `/api/supplier/sub-vendors/${id}/price-items`, json: body, idempotencyKey: key });
export const deletePriceItem = (u: PortalUser, id: number, itemId: number, key: string) =>
  crmCall(actorOf(u), { method: "DELETE", path: `/api/supplier/sub-vendors/${id}/price-items/${itemId}`, idempotencyKey: key });
export const addLedgerEntry = (u: PortalUser, id: number, body: { entryDate: string; description: string; debitAmount: number; creditAmount: number; note?: string | null }, key: string) =>
  crmCall(actorOf(u), { method: "POST", path: `/api/supplier/sub-vendors/${id}/ledger`, json: body, idempotencyKey: key });
