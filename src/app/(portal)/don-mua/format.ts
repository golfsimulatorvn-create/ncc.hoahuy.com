/** Dinh dang ngay/tien theo ngon ngu dang chon; trang thai -> mau chip (dung chung danh sach + chi tiet don mua). */
export function fmtDate(v: string | null | undefined, locale: string): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}

export function fmtMoney(v: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: currency === "VND" ? 0 : 2 }).format(v);
  } catch {
    return `${new Intl.NumberFormat(locale).format(v)} ${currency}`;
  }
}

export const STATUS_CHIP: Record<string, string> = {
  SENT: "bg-warn-bg text-warn-fg", CONFIRMED: "bg-info-bg text-info-fg", PARTIALLY_RECEIVED: "bg-part-bg text-part-fg",
  RECEIVED: "bg-ok-bg text-ok-fg", CANCELLED: "bg-done-bg text-done-fg",
};
