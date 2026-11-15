export const LOCALES = ["vi", "zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "vi";
export const LOCALE_COOKIE = "HH_LOCALE";

/** Moi namespace = 1 tep messages/<locale>/<ns>.json. Them namespace moi phai them o day. */
export const NAMESPACES = ["common", "auth", "nav", "orders", "rfq", "payables", "claims", "docs", "costs", "users", "email", "errors"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}
