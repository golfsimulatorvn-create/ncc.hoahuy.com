import type { PortalUser } from "./session";
import { crmCall, type CrmActor } from "./crmClient";

/** Goi API Don mua hang cua CRM thay mat nguoi dung cong (specs/054, T056). Vai tro != ADMIN: CRM KHONG tra gia/tien. */
export const actorOf = (u: PortalUser): CrmActor => ({ id: u.id, credentialId: u.credentialId, displayName: u.displayName, role: u.role });

export type OrderRow = {
  id: number; code: string; orderDate: string; status: string; totalQty: number; receivedQty: number;
  expectedDeliveryDate: string | null; supplierConfirmedAt: string | null; supplierEtaDate: string | null;
  total?: number; priceChanged?: boolean;
};
export type OrderLine = {
  id: number; code: string | null; name: string; unit: string; qty: number; receivedQty: number; remainingQty: number;
  supplierEtaDate: string | null; unitPrice?: number; lineAmount?: number;
  priceChanged?: { from: number; to: number; at: string } | null;
};
export type OrderDetail = {
  id: number; code: string; orderDate: string; status: string; subVendorName: string | null; expectedDeliveryDate: string | null;
  currency: string; supplierConfirmedAt: string | null; supplierConfirmedByName: string | null; supplierEtaDate: string | null;
  lines: OrderLine[]; vatRate?: number; total?: number; totalPaid?: number; totalRemaining?: number;
  payments?: { id: number; amount: number; status: string; scheduledAt: string | null; paidAt: string | null; note: string | null }[];
};

export const listOrders = (u: PortalUser) => crmCall<OrderRow[]>(actorOf(u), { path: "/api/supplier/orders" });
export const getOrder = (u: PortalUser, id: number) => crmCall<OrderDetail>(actorOf(u), { path: `/api/supplier/orders/${id}` });
export const confirmOrder = (u: PortalUser, id: number, body: { etaDate?: string | null; lineEtas?: { lineId: number; etaDate: string }[]; note?: string | null }, idempotencyKey: string) =>
  crmCall(actorOf(u), { method: "POST", path: `/api/supplier/orders/${id}/confirm`, json: body, idempotencyKey });
export const setSubVendorName = (u: PortalUser, id: number, subVendorName: string | null, idempotencyKey: string) =>
  crmCall(actorOf(u), { method: "PATCH", path: `/api/supplier/orders/${id}`, json: { subVendorName }, idempotencyKey });
