import { getLocale } from "next-intl/server";
import { LOCALES } from "@/i18n/config";
import { setLocaleAction } from "@/app/(auth)/actions";

const LABEL: Record<string, string> = { vi: "VI", zh: "中文", en: "EN" };

/** Chon ngon ngu (luu theo tai khoan + cookie). Moi nut la 1 form de dung duoc khong can JavaScript. */
export async function LocaleSwitch({ back = "/" }: { back?: string }) {
  const current = await getLocale();
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-line-strong bg-white text-[12px]" role="group" aria-label="Language">
      {LOCALES.map((l) => (
        <form key={l} action={setLocaleAction}>
          <input type="hidden" name="locale" value={l} />
          <input type="hidden" name="back" value={back} />
          <button type="submit" aria-pressed={l === current} className={`min-h-9 px-2.5 py-1.5 ${l === current ? "bg-forest font-semibold text-white" : "text-ink-2 hover:bg-surface-sunk"}`}>{LABEL[l]}</button>
        </form>
      ))}
    </div>
  );
}
