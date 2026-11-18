/** Doc so kieu Viet/Anh: "1.180.000" / "1,180,000" = 1180000; "12,5" / "12.5" = 12.5. Rong -> null; sai -> NaN. */
export function parseMoney(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ""));
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = Math.max(lastDot, lastComma);
    return Number(s.slice(0, dec).replace(/[.,]/g, "") + "." + s.slice(dec + 1));
  }
  return Number(s.replace(",", "."));
}
