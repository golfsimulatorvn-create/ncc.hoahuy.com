/** Ô chọn NCC thứ cấp mặc định của một MÃ HÀNG ngay trên dòng đơn mua / RFQ (specs/068). Thuộc form `costform` (thuộc tính form=)
 * nên không lồng form. `os_<i>` = NCC lúc mở trang (để chỉ gửi dòng đã đổi), `s_<i>` = NCC đang chọn ("" = chưa chọn). */
export type SubVendorChoice = { id: number; name: string; active: boolean };

export function LineSubVendorSelect({ i, code, current, options, label, noneLabel, inactiveLabel, form = "costform" }: {
  i: number; code: string; current: { id: number; name: string } | null; options: SubVendorChoice[];
  label: string; noneLabel: string; inactiveLabel: (name: string) => string;
  /** id form chua o chon; "" = o chon nam thang trong form luu (tab theo ma). */
  form?: string;
}) {
  const formAttr = form ? { form } : {};
  // NCC đang gắn mà đã ngừng hoạt động: vẫn hiện tên (có nhãn) để không mất thông tin, nhưng không chọn mới được.
  const list = [...options.filter((o) => o.active)];
  const cur = current ? options.find((o) => o.id === current.id) : undefined;
  const orphan = current && !list.some((o) => o.id === current.id) ? { id: current.id, name: cur ? inactiveLabel(cur.name) : inactiveLabel(current.name) } : null;
  return (
    <div className="min-w-0">
      <input type="hidden" {...formAttr} name={`os_${i}`} value={current?.id ?? ""} />
      <select {...formAttr} name={`s_${i}`} defaultValue={current?.id ?? ""} aria-label={`${label} ${code}`} className="input min-h-[44px] w-full min-w-0">
        <option value="">{noneLabel}</option>
        {orphan && <option value={orphan.id}>{orphan.name}</option>}
        {list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}
