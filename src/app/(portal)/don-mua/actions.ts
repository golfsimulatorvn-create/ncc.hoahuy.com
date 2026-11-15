"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CrmError } from "@/server/crmClient";
import { confirmOrder, setSubVendorName } from "@/server/crmOrders";
import { requirePerm } from "@/server/session";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function back(id: number, kind: "ok" | "err", msg: string): never {
  redirect(`/don-mua/${id}?${kind}=${encodeURIComponent(msg)}`);
}
function errCode(e: unknown): string {
  if (e instanceof CrmError) {
    if (e.code === "ORDER_STATE") return "state";
    if (e.code === "CRM_UNAVAILABLE") return "unavailable";
    if (e.code === "SUPPLIER_SUSPENDED") return "suspended";
    if (e.status === 422 || e.status === 400) return "invalid";
  }
  return "failed";
}

/** Xac nhan don + bao ngay giao du kien. Quyen `orders.confirm` kiem o may chu; Idempotency-Key tu o an cua form (gui lai khong ghi trung). */
export async function confirmOrderAction(formData: FormData): Promise<void> {
  const me = await requirePerm("orders.confirm");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) redirect("/don-mua");
  const key = String(formData.get("key") ?? "");
  const eta = day.safeParse(formData.get("etaDate"));
  const lineEtas: { lineId: number; etaDate: string }[] = [];
  for (const [k, v] of formData.entries()) {
    const m = /^line_(\d+)$/.exec(k);
    if (m && String(v)) {
      const d = day.safeParse(v);
      if (!d.success) back(id, "err", "invalid");
      lineEtas.push({ lineId: Number(m[1]), etaDate: d.data! });
    }
  }
  if (!eta.success && lineEtas.length === 0) back(id, "err", "needEta");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  try {
    await confirmOrder(me, id, { etaDate: eta.success ? eta.data : null, lineEtas, note }, key || crypto.randomUUID());
  } catch (e) {
    back(id, "err", errCode(e));
  }
  revalidatePath(`/don-mua/${id}`);
  back(id, "ok", "confirmed");
}

export async function subVendorAction(formData: FormData): Promise<void> {
  const me = await requirePerm("orders.confirm");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) redirect("/don-mua");
  const name = String(formData.get("subVendorName") ?? "").trim().slice(0, 200) || null;
  try {
    await setSubVendorName(me, id, name, String(formData.get("key") ?? "") || crypto.randomUUID());
  } catch (e) {
    back(id, "err", errCode(e));
  }
  revalidatePath(`/don-mua/${id}`);
  back(id, "ok", "saved");
}
