import type { PortalUser } from "./session";
import { crmCall } from "./crmClient";
import { actorOf } from "./crmOrders";

/** API Cong no cua CRM (specs/054, T084): chi doc tu so Ke toan da ghi so, chi Quan tri NCC. Doi chieu ky chi luu ghi nhan, khong sinh but toan. */
export type PayableSummary = { balance: number; overdue: number; openInvoices: number; currency: string; asOf: string };
export type PayableItem = {
  id: number; docNo: string; docDate: string; dueDate: string; amount: number; paidAmount: number; remaining: number;
  purchaseOrderCode: string | null; overdue: boolean; source: string;
};
export type Statement = { from: string; to: string; opening: number; issued: number; paid: number; closing: number };
export type Reconciliation = {
  id: number; periodFrom: string; periodTo: string; status: "KHOP" | "LECH"; note: string | null;
  openingBalance: number; issued: number; paid: number; closingBalance: number; confirmedByName: string; createdAt: string;
};

export const getSummary = (u: PortalUser) => crmCall<PayableSummary>(actorOf(u), { path: "/api/supplier/payables/summary" });
export const listItems = (u: PortalUser, status: "open" | "all") => crmCall<PayableItem[]>(actorOf(u), { path: "/api/supplier/payables/items", query: { status } });
export const getStatement = (u: PortalUser, from: string, to: string) => crmCall<Statement>(actorOf(u), { path: "/api/supplier/payables/statement", query: { from, to } });
export const listReconciliations = (u: PortalUser) => crmCall<Reconciliation[]>(actorOf(u), { path: "/api/supplier/payables/reconciliations" });
export const confirmReconciliation = (u: PortalUser, body: { from: string; to: string; status: "KHOP" | "LECH"; note: string | null }, key: string) =>
  crmCall(actorOf(u), { method: "POST", path: "/api/supplier/payables/reconciliations", json: body, idempotencyKey: key });
