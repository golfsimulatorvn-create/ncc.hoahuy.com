import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { loadMessages } from "./messages";
import { getSessionUser } from "@/server/session";

/** Khong dinh tuyen theo ngon ngu: tai khoan dang nhap -> cookie HH_LOCALE -> vi. Thieu ban dich => hien tieng Viet. */
export async function resolveLocale(): Promise<Locale> {
  const user = await getSessionUser().catch(() => null);
  if (user && isLocale(user.locale)) return user.locale;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return { locale, messages: loadMessages(locale) as never };
});
