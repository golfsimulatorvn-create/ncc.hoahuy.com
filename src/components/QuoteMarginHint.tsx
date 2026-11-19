"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { parseMoney } from "@/server/parseMoney";

/** Lãi gộp tức thì khi gõ đơn giá báo (VND) so với giá đầu vào đang điền cùng dòng. Chỉ nhắc, không chặn nộp. */
export function QuoteMarginHint({ lineId, i }: { lineId: number; i: number }) {
  const t = useTranslations("rfq.margin");
  const locale = useLocale();
  const [st, setSt] = useState<{ price: number | null; cost: number | null; cur: string }>({ price: null, cost: null, cur: "VND" });

  useEffect(() => {
    const read = () => {
      const p = document.getElementById(`price_${lineId}`) as HTMLInputElement | null;
      const c = document.getElementById(`cost_p_${i}`) as HTMLInputElement | null;
      const u = document.getElementById(`cost_cur_${i}`) as HTMLSelectElement | null;
      const num = (el: HTMLInputElement | null) => { const v = el ? parseMoney(el.value) : null; return v !== null && Number.isFinite(v) ? v : null; };
      setSt({ price: num(p), cost: num(c), cur: u?.value ?? "VND" });
    };
    read();
    const els = [`price_${lineId}`, `cost_p_${i}`, `cost_cur_${i}`].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    els.forEach((e) => { e.addEventListener("input", read); e.addEventListener("change", read); });
    return () => els.forEach((e) => { e.removeEventListener("input", read); e.removeEventListener("change", read); });
  }, [lineId, i]);

  const nf = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);
  const { price, cost, cur } = st;
  let cls = "bg-warn-bg text-warn-fg";
  let text = t("noCost");
  if (price === null || price <= 0) return null;
  if (cost !== null && cur !== "VND") text = t("otherCurrency");
  else if (cost !== null) {
    const diff = price - cost;
    if (diff < 0) { cls = "bg-danger-bg text-danger-fg"; text = t("loss", { amount: nf(-diff) }); }
    else { cls = "bg-ok-bg text-ok-fg"; text = t("gain", { pct: nf((diff / price) * 100), amount: nf(diff) }); }
  }
  return <div role="status" className={`chip mt-1 whitespace-normal ${cls}`}>{text}</div>;
}
