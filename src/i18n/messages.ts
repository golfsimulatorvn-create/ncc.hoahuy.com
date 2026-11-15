import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "next-intl";
import { DEFAULT_LOCALE, NAMESPACES, type Locale } from "./config";

const cache = new Map<Locale, Record<string, unknown>>();

function readNs(locale: Locale, ns: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", locale, `${ns}.json`), "utf8"));
  } catch {
    return {};
  }
}

/** Gop moi namespace; thieu ban dich cua ngon ngu dang chon thi lay tieng Viet (khong hien khoa). */
export function loadMessages(locale: Locale): Record<string, unknown> {
  const hit = cache.get(locale);
  if (hit && process.env.NODE_ENV === "production") return hit;
  const out: Record<string, unknown> = {};
  for (const ns of NAMESPACES) {
    const vi = readNs(DEFAULT_LOCALE, ns);
    out[ns] = locale === DEFAULT_LOCALE ? vi : deepMerge(vi, readNs(locale, ns));
  }
  cache.set(locale, out);
  return out;
}

function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    r[k] = v && typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object" ? deepMerge(base[k] as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return r;
}

/** Dich ngoai luong request (email, tac vu nen): createTranslator thuan, khong phu thuoc cookie. */
export function translator(locale: Locale, ns: string) {
  return createTranslator({ locale, messages: loadMessages(locale) as never, namespace: ns as never }) as unknown as (key: string, values?: Record<string, string | number>) => string;
}
