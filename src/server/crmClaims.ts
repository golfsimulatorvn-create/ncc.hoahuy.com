import type { PortalUser } from "./session";
import { crmCall, crmFetchRaw, CrmError } from "./crmClient";
import { actorOf } from "./crmOrders";

/** API Khieu nai + Chung tu cua CRM (specs/054, T095). CRM chi tra khieu nai Mua hang da chia se cho NCC nay; khong co ghi chu noi bo. */
export type ClaimRow = {
  id: number; claimType: string; status: string; requestedAt: string; quantity: number | null; unit: string | null;
  subject: string | null; lotOrSerial: string | null; responded: boolean;
};
export type ClaimDetail = Omit<ClaimRow, "responded"> & {
  supplierResponseNote: string | null; supplierRespondedAt: string | null; supplierRespondedByName: string | null;
  sharedAttachments: { id: number; fileName: string; uploadedAt: string }[];
};
export type DocRow = {
  id: number; entityType: string; entityId: number; docType: string; fileName: string; mimeType: string; sizeBytes: number;
  uploadedByName: string; createdAt: string;
};
export const DOC_TYPES = ["HOA_DON", "PACKING_LIST", "CHUNG_TU_GIAO_HANG", "PHAN_HOI", "KHAC"] as const;
export type DocEntity = "PURCHASE_ORDER" | "CLAIM";

export const listClaims = (u: PortalUser) => crmCall<ClaimRow[]>(actorOf(u), { path: "/api/supplier/claims" });
export const getClaim = (u: PortalUser, id: number) => crmCall<ClaimDetail>(actorOf(u), { path: `/api/supplier/claims/${id}` });
export const respondClaim = (u: PortalUser, id: number, note: string, idempotencyKey: string) =>
  crmCall(actorOf(u), { method: "POST", path: `/api/supplier/claims/${id}/respond`, json: { note }, idempotencyKey });

export const listDocs = (u: PortalUser, entityType: DocEntity, entityId: number) =>
  crmCall<DocRow[]>(actorOf(u), { path: "/api/supplier/documents", query: { entityType, entityId } });
export const uploadDoc = (u: PortalUser, form: FormData, idempotencyKey: string) =>
  crmCall<{ id: number; replayed: boolean }>(actorOf(u), { method: "POST", path: "/api/supplier/documents", form, idempotencyKey, timeoutMs: 60_000 });
export const deleteDoc = (u: PortalUser, id: number, idempotencyKey: string) =>
  crmCall(actorOf(u), { method: "DELETE", path: `/api/supplier/documents/${id}`, idempotencyKey });

/** Tai tep tu CRM (chung tu NCC da tai len / anh minh hoa khieu nai): tra Response de route cong chuyen tiep cho trinh duyet. */
export async function fetchFile(u: PortalUser, path: string): Promise<Response> {
  const res = await crmFetchRaw(actorOf(u), { path, timeoutMs: 60_000 });
  if (!res.ok) throw new CrmError("Không tải được tệp.", res.status);
  return res;
}
