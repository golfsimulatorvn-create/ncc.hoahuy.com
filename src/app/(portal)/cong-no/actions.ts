"use server";

import { redirect } from "next/navigation";
import { CrmError } from "@/server/crmClient";
import { confirmReconciliation } from "@/server/crmPayables";
import { requirePerm } from "@/server/session";

const day = /^\d{4}-\d{2}-\d{2}$/;

async function reconcile(f: FormData, status: "KHOP" | "LECH"): Promise<void> {
  const me = await requirePerm("payables.reconcile");
  const from = String(f.get("from") ?? "");
  const to = String(f.get("to") ?? "");
  const q = `tu=${from}&den=${to}`;
  const go = (kind: "ok" | "err", msg: string): never => redirect(`/cong-no?${q}&${kind}=${msg}`);
  if (!day.test(from) || !day.test(to) || to < from) go("err", "range");
  const note = String(f.get("note") ?? "").trim().slice(0, 1000) || null;
  if (status === "LECH" && !note) go("err", "needNote");
  try {
    await confirmReconciliation(me, { from, to, status, note }, String(f.get("key") ?? "") || crypto.randomUUID());
  } catch (e) {
    if (e instanceof CrmError) {
      if (e.code === "CRM_UNAVAILABLE") go("err", "unavailable");
      if (e.code === "SUPPLIER_SUSPENDED") go("err", "suspended");
      if (e.status === 422) go("err", "noData");
    }
    go("err", "failed");
  }
  go("ok", status === "KHOP" ? "confirmed" : "disputed");
}

/** Quyen `payables.reconcile` (chi Quan tri NCC) kiem o may chu; CRM tinh lai so lieu luc goi va chi luu ghi nhan. */
export async function confirmMatchAction(f: FormData): Promise<void> {
  return reconcile(f, "KHOP");
}
export async function reportMismatchAction(f: FormData): Promise<void> {
  return reconcile(f, "LECH");
}
