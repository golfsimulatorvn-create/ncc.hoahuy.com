"use server";

import { redirect } from "next/navigation";
import { CrmError } from "@/server/crmClient";
import { addLedgerEntry, archiveSubVendor, createSubVendor, deletePriceItem, savePriceItem } from "@/server/crmCosts";
import { requirePerm } from "@/server/session";

const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
const num = (f: FormData, k: string) => Number(String(f.get(k) ?? "").trim().replace(/,/g, "."));
const key = (f: FormData) => text(f, "key", 80) || crypto.randomUUID();

function go(path: string, kind: "ok" | "err", msg: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);
}
function errCode(e: unknown): string {
  if (e instanceof CrmError) {
    if (e.code === "SUBVENDOR_HAS_DEBT") return "hasDebt";
    if (e.code === "CRM_UNAVAILABLE") return "unavailable";
    if (e.code === "SUPPLIER_SUSPENDED") return "suspended";
    if (e.status === 400 || e.status === 422) return "invalid";
    if (e.status === 404) return "notFound";
  }
  return "failed";
}
async function run(path: string, okMsg: string, fn: () => Promise<unknown>): Promise<never> {
  try { await fn(); } catch (e) { go(path, "err", errCode(e)); }
  return go(path, "ok", okMsg);
}

function idOf(f: FormData): number {
  const id = Number(f.get("id"));
  if (!Number.isInteger(id) || id <= 0) redirect("/gia-dau-vao");
  return id;
}

/** Moi thao tac: quyen kiem o may chu (costs.edit = Quan tri + Nhan vien, costs.delete = chi Quan tri); COST_VIEWER chi doc. */
export async function createSubVendorAction(f: FormData): Promise<void> {
  const me = await requirePerm("costs.edit");
  const name = text(f, "name", 200);
  if (!name) go("/gia-dau-vao", "err", "invalid");
  try {
    const r = await createSubVendor(me, { name, contactName: text(f, "contactName", 200) || null, phone: text(f, "phone", 50) || null, note: text(f, "note", 1000) || null }, key(f));
    redirect(`/gia-dau-vao/${r.id}?ok=created`);
  } catch (e) {
    if (e instanceof CrmError) go("/gia-dau-vao", "err", errCode(e));
    throw e;
  }
}

export async function archiveSubVendorAction(f: FormData): Promise<void> {
  const me = await requirePerm("costs.delete");
  const id = idOf(f);
  try { await archiveSubVendor(me, id, key(f)); } catch (e) { go(`/gia-dau-vao/${id}`, "err", errCode(e)); }
  go("/gia-dau-vao", "ok", "archived");
}

export async function savePriceItemAction(f: FormData): Promise<void> {
  const me = await requirePerm("costs.edit");
  const id = idOf(f);
  const path = `/gia-dau-vao/${id}`;
  const price = num(f, "unitPrice");
  const itemName = text(f, "itemName", 300);
  const unit = text(f, "unit", 30);
  if (!itemName || !unit || !Number.isFinite(price) || price < 0) go(path, "err", "invalid");
  const itemId = Number(f.get("itemId")) || null;
  await run(path, "priceSaved", () => savePriceItem(me, id, { id: itemId, itemName, unit, unitPrice: price, note: text(f, "note", 500) || null }, key(f)));
}

export async function deletePriceItemAction(f: FormData): Promise<void> {
  const me = await requirePerm("costs.delete");
  const id = idOf(f);
  const itemId = Number(f.get("itemId"));
  if (!Number.isInteger(itemId) || itemId <= 0) go(`/gia-dau-vao/${id}`, "err", "invalid");
  await run(`/gia-dau-vao/${id}`, "priceDeleted", () => deletePriceItem(me, id, itemId, key(f)));
}

export async function addLedgerAction(f: FormData): Promise<void> {
  const me = await requirePerm("costs.edit");
  const id = idOf(f);
  const path = `/gia-dau-vao/${id}`;
  const debit = f.get("debitAmount") ? num(f, "debitAmount") : 0;
  const credit = f.get("creditAmount") ? num(f, "creditAmount") : 0;
  const date = text(f, "entryDate", 10);
  const description = text(f, "description", 500);
  const validAmount = Number.isFinite(debit) && Number.isFinite(credit) && debit >= 0 && credit >= 0 && (debit > 0) !== (credit > 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !description || !validAmount) go(path, "err", "invalidLedger");
  await run(path, "ledgerAdded", () => addLedgerEntry(me, id, { entryDate: date, description, debitAmount: debit, creditAmount: credit, note: text(f, "note", 500) || null }, key(f)));
}
