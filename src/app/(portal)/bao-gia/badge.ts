/** Nhan trang thai RFQ voi chinh NCC nay: Moi (chua nop) / Da nop / Qua han / Trung / Khong trung / Da huy. */
export function rfqBadge(r: { status: string; result: "WON" | "LOST" | "CANCELLED" | null; submitted: boolean; dueAt: string }): { key: string; cls: string } {
  if (r.result === "WON") return { key: "won", cls: "bg-ok-bg text-ok-fg" };
  if (r.result === "LOST") return { key: "lost", cls: "bg-done-bg text-done-fg" };
  if (r.result === "CANCELLED") return { key: "cancelled", cls: "bg-done-bg text-done-fg" };
  if (r.submitted) return { key: "submitted", cls: "bg-info-bg text-info-fg" };
  if (new Date(r.dueAt).getTime() < Date.now()) return { key: "expired", cls: "bg-danger-bg text-danger-fg" };
  return { key: "open", cls: "bg-warn-bg text-warn-fg" };
}
