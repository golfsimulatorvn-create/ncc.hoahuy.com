import type { PortalUser } from "./session";
import { crmCall } from "./crmClient";
import { actorOf } from "./crmOrders";

/** API Yeu cau bao gia cua CRM (specs/054, T063). Don gia bao gia la gia ban ra cho Hoa Huy: CRM chi tra cho Quan tri NCC. */
export type RfqRow = {
  rfqId: number; code: string; dueAt: string; status: string; result: "WON" | "LOST" | "CANCELLED" | null;
  firstLineLabel: string; extraLineCount: number; submitted: boolean;
};
export type RfqDetail = {
  id: number; code: string; dueAt: string; status: string; note: string | null; result: "WON" | "LOST" | "CANCELLED" | null; submitted: boolean;
  lines: { id: number; code: string; name: string; unit: string; qty: number; unitPrice?: number | null; leadTimeDays?: number | null; inputPrice?: number | null; inputCurrency?: string | null; subVendorId?: number | null; subVendorName?: string | null; grossPct?: number; grossAmount?: number }[];
};

export const listRfqs = (u: PortalUser) => crmCall<RfqRow[]>(actorOf(u), { path: "/api/supplier/rfqs" });
export const getRfq = (u: PortalUser, id: number) => crmCall<RfqDetail>(actorOf(u), { path: `/api/supplier/rfqs/${id}` });
export const saveQuote = (u: PortalUser, id: number, body: { submit: boolean; lines: { rfqLineId: number; unitPrice: number; leadTimeDays: number | null }[] }, idempotencyKey: string) =>
  crmCall(actorOf(u), { method: "POST", path: `/api/supplier/rfqs/${id}/quote`, json: body, idempotencyKey });
