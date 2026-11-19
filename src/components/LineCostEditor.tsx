/** Ô điền giá đầu vào ngay trên một dòng đơn mua / RFQ. Thuộc form `costform` (thuộc tính form=) nên không lồng form
 * và không làm mất dữ liệu đang nhập ở form chính. `id` ô giá = `cost_p_<i>`, ô tiền = `cost_cur_<i>` (QuoteMarginHint đọc). */
export function LineCostEditor({ i, code, price, currency, label, curLabel, placeholder }: {
  i: number; code: string; price: number | null; currency: string; label: string; curLabel: string; placeholder: string;
}) {
  const val = price == null ? "" : String(price);
  return (
    <div className="flex min-w-0 items-center justify-end gap-1.5">
      <input type="hidden" form="costform" name={`c_${i}`} value={code} />
      <input type="hidden" form="costform" name={`o_${i}`} value={val} />
      <input type="hidden" form="costform" name={`oc_${i}`} value={currency} />
      <input id={`cost_p_${i}`} form="costform" name={`p_${i}`} defaultValue={val} inputMode="decimal" placeholder={placeholder} aria-label={`${label} ${code}`} className="input min-h-[44px] w-28 min-w-0 text-right" />
      <select id={`cost_cur_${i}`} form="costform" name={`cur_${i}`} defaultValue={currency} aria-label={curLabel} className="input min-h-[44px] w-[76px] min-w-0">
        {["VND", "USD", "CNY", "EUR"].map((c) => <option key={c}>{c}</option>)}
      </select>
    </div>
  );
}
