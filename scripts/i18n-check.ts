/**
 * Kiem tra ban dich (3 ngon ngu vi/zh/en): moi khoa o vi phai co o zh/en, tham so {x} khop, khong co khoa thua,
 * va moi khoa `t("...")` dung trong ma deu ton tai. Chay: npm run i18n:check  (phai sach moi bao xong).
 */
import fs from "node:fs";
import path from "node:path";

const LOCALES = ["vi", "zh", "en"] as const;
const ROOT = path.resolve(process.cwd(), "messages");

function flatten(o: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  else out[prefix] = String(o);
  return out;
}

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const files = fs.readdirSync(path.join(ROOT, "vi")).filter((f) => f.endsWith(".json"));
const data: Record<string, Record<string, Record<string, string>>> = {};
let errors = 0;
const err = (m: string) => { errors++; console.log(`  ✗ ${m}`); };

console.log("== Khóa dịch ==");
for (const f of files) {
  const ns = f.replace(/\.json$/, "");
  data[ns] = {};
  for (const l of LOCALES) {
    const p = path.join(ROOT, l, f);
    if (!fs.existsSync(p)) { err(`${l}/${f} thiếu tệp`); continue; }
    data[ns][l] = flatten(JSON.parse(fs.readFileSync(p, "utf8")));
  }
  const vi = data[ns].vi ?? {};
  for (const l of ["zh", "en"] as const) {
    const o = data[ns][l] ?? {};
    for (const k of Object.keys(vi)) {
      if (!(k in o)) err(`${l}/${ns}: thiếu khóa ${k}`);
      else if (params(vi[k]) !== params(o[k])) err(`${l}/${ns}: tham số lệch ở ${k} (vi: ${params(vi[k])} | ${l}: ${params(o[k])})`);
      else if (!o[k].trim()) err(`${l}/${ns}: rỗng ${k}`);
    }
    for (const k of Object.keys(o)) if (!(k in vi)) err(`${l}/${ns}: khóa thừa ${k}`);
  }
}

console.log("== Khóa dùng trong mã nhưng chưa có ==");
const known = new Set<string>();
for (const ns of Object.keys(data)) for (const k of Object.keys(data[ns].vi ?? {})) known.add(`${ns}.${k}`);
const dynamicPrefix = (k: string) => [...known].some((x) => x.startsWith(`${k}.`));
function walk(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) scan(p);
  }
}
/** Trong 1 tep: moi bien dich (t, tc...) co the khai bao o nhieu ham voi namespace khac nhau, nen khoa hop le neu co o IT NHAT 1 namespace cua bien do. */
function scan(file: string) {
  const src = fs.readFileSync(file, "utf8");
  const nsByVar: Record<string, string[]> = {};
  for (const m of src.matchAll(/const\s+(?:\[?(\w+)\]?)\s*=\s*(?:await\s+)?(?:getTranslations|useTranslations)\(\s*(?:"([^"]*)")?\s*\)/g)) (nsByVar[m[1]] ??= []).push(m[2] ?? "");
  for (const [fn, list] of Object.entries(nsByVar)) {
    for (const m of src.matchAll(new RegExp("\\b" + fn + "\\(\\s*\"([\\w.]+)\"", "g"))) {
      const key = m[1];
      const ok = list.some((ns) => { const full = ns ? `${ns}.${key}` : key; return known.has(full) || dynamicPrefix(full); });
      if (!ok) err(`${path.relative(process.cwd(), file)}: khóa không tồn tại: ${key} (namespace ${list.join("|") || "gốc"})`);
    }
  }
}
walk(path.resolve(process.cwd(), "src"));

console.log(errors ? `\n${errors} lỗi.` : "\nSạch: đủ 3 ngôn ngữ, tham số khớp, không thiếu khóa.");
process.exit(errors ? 1 : 0);
