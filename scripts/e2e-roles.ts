/**
 * E2E ma tran vai tro Cong NCC (specs/054 T100 + T102): 4 vai tro x 3 ngon ngu x desktop + iPhone.
 * Kiem: menu dung theo vai tro, route khong co quyen bi chuyen ve trang dau cua vai tro (may chu), gia chi Quan tri thay,
 * khong tran ngang (iPhone), khong lo khoa dich (vd "orders.status.X"), tieu de dung ngon ngu.
 * Ma tran quyen o day viet TAY (doc lap voi src/server/permissions.ts) de bat loi khi ma tran bi sua nham.
 * Can: cong dev :3200 + CRM dev (xem e2e-orders.ts). Chay: npx tsx scripts/e2e-roles.ts [--engine=desktop|iphone]
 */
try { process.loadEnvFile(".env"); } catch { /* da co bien */ }
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium, devices, webkit, type Browser } from "@playwright/test";

const BASE = "http://localhost:3200";
const ENGINE = process.argv.find((a) => a.startsWith("--engine="))?.slice(9) ?? "all";
const CRM_DIR = path.resolve(process.cwd(), "..", "hoahuy-ERP-app");
let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; } else { failed++; console.log(`FAIL  ${name}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`); }
}
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !["DATABASE_URL", "TOKEN_PEPPER", "CRED_ENC_KEY"].includes(k))) as unknown as NodeJS.ProcessEnv;
const crmScript = (...a: string[]) => execFileSync("npx", ["tsx", "scripts/_e2e-portal-orders-seed.ts", ...a], { cwd: CRM_DIR, encoding: "utf8", shell: true, env: cleanEnv });
const jsonOf = (out: string) => JSON.parse(out.split("\n").find((l) => l.startsWith("JSON:"))!.slice(5));

type Role = "ADMIN" | "STAFF" | "VIEWER" | "COST_VIEWER";
const ROLES: Role[] = ["ADMIN", "STAFF", "VIEWER", "COST_VIEWER"];
const LOCALES = ["vi", "zh", "en"] as const;

/** Muc menu moi vai tro thay (tay). */
const MENU: Record<Role, string[]> = {
  ADMIN: ["/don-mua", "/bao-gia", "/cong-no", "/khieu-nai", "/chung-tu", "/gia-dau-vao", "/nguoi-dung"],
  STAFF: ["/don-mua", "/bao-gia", "/khieu-nai", "/chung-tu", "/gia-dau-vao"],
  VIEWER: ["/don-mua", "/bao-gia", "/khieu-nai", "/chung-tu"],
  COST_VIEWER: ["/gia-dau-vao"],
};
/** Man nao vao duoc: khoa theo goc duong dan (man chi tiet theo goc cua no). */
const ACCESS: Record<string, Role[]> = {
  "/don-mua": ["ADMIN", "STAFF", "VIEWER"], "/bao-gia": ["ADMIN", "STAFF", "VIEWER"], "/cong-no": ["ADMIN"],
  "/khieu-nai": ["ADMIN", "STAFF", "VIEWER"], "/chung-tu": ["ADMIN", "STAFF", "VIEWER"], "/gia-dau-vao": ["ADMIN", "STAFF", "COST_VIEWER"],
  "/nguoi-dung": ["ADMIN"],
};
const HOME: Record<Role, string> = { ADMIN: "/don-mua", STAFF: "/don-mua", VIEWER: "/don-mua", COST_VIEWER: "/gia-dau-vao" };
const VN = /[ăâđêôơưàáạảãằắẵặẳầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i;
const CJK = /[一-鿿]/;
const KEY_LEAK = /\b(?:orders|rfq|payables|claims|docs|costs|users|common|nav|errors|auth)\.[a-zA-Z]+(?:\.[a-zA-Z_]+)*\b/;

async function main() {
  const { db } = await import("../src/server/db");
  const { encryptSecret, hashPassword, hashToken, randomToken } = await import("../src/server/crypto");
  const seed = jsonOf(crmScript("seed")) as { supplierId: number; apiKey: string; sentId: number; rfqId: number };
  crmScript("seed-ap", String(seed.supplierId));
  const claim = jsonOf(crmScript("seed-claim", String(seed.supplierId))) as { claimId: number };
  const tag = `er${Date.now()}`;
  const cred = await db.supplierCredential.create({ data: { crmSupplierId: seed.supplierId, supplierCode: tag, supplierName: `NCC ${tag}`, apiKeyEnc: encryptSecret(seed.apiKey) } });
  const users = {} as Record<Role, { id: number; token: string }>;
  for (const r of ROLES) {
    const u = await db.supplierUser.create({ data: { credentialId: cred.id, email: `${tag}.${r}@test.vn`, displayName: `User ${r}`, role: r, status: "ACTIVE", passwordHash: await hashPassword("MatKhauE2E12345"), locale: "vi" } });
    const token = randomToken(32);
    await db.session.create({ data: { id: hashToken(token), userId: u.id, expiresAt: new Date(Date.now() + 3600_000), lastSeenAt: new Date() } });
    users[r] = { id: u.id, token };
  }
  // Man chi tiet dung du lieu mau; khoa = goc de tra ACCESS.
  const pages: { url: string; root: string; priceInputs?: boolean }[] = [
    { url: "/don-mua", root: "/don-mua" }, { url: `/don-mua/${seed.sentId}`, root: "/don-mua" },
    { url: "/bao-gia", root: "/bao-gia" }, { url: `/bao-gia/${seed.rfqId}`, root: "/bao-gia", priceInputs: true },
    { url: "/cong-no?tu=2026-11-01&den=2026-11-30", root: "/cong-no" },
    { url: "/khieu-nai", root: "/khieu-nai" }, { url: `/khieu-nai/${claim.claimId}`, root: "/khieu-nai" },
    { url: "/chung-tu", root: "/chung-tu" }, { url: "/gia-dau-vao", root: "/gia-dau-vao" }, { url: "/nguoi-dung", root: "/nguoi-dung" },
  ];

  try {
    for (const engine of (["desktop", "iphone"] as const).filter((e) => ENGINE === "all" || e === ENGINE)) {
      const browser: Browser = engine === "desktop" ? await chromium.launch() : await webkit.launch(process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {});
      for (const role of ROLES) {
        for (const loc of LOCALES) {
          const tg = `[${engine}/${role}/${loc}]`;
          await db.supplierUser.update({ where: { id: users[role].id }, data: { locale: loc } }); // ngon ngu cua tai khoan uu tien hon cookie
          const ctx = await browser.newContext(engine === "iphone" ? { ...devices["iPhone 13"] } : { viewport: { width: 1366, height: 900 } });
          await ctx.addCookies([{ name: "hh_ncc_session", value: users[role].token, url: BASE }, { name: "HH_LOCALE", value: loc, url: BASE }]);
          const p = await ctx.newPage();

          // Menu
          await p.goto(`${BASE}${HOME[role]}`);
          const hrefs = await p.locator('aside nav a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")));
          check(`${tg} menu`, JSON.stringify(hrefs) === JSON.stringify(MENU[role]), hrefs);

          for (const pg of pages) {
            const res = await p.goto(`${BASE}${pg.url}`);
            const path0 = new URL(p.url()).pathname;
            const allowed = ACCESS[pg.root].includes(role);
            if (!allowed) {
              check(`${tg} ${pg.url} bi chan -> ve trang dau`, path0 === HOME[role], path0);
              continue;
            }
            check(`${tg} ${pg.url} vao duoc`, path0 === new URL(`${BASE}${pg.url}`).pathname && (res?.status() ?? 0) < 400, { path0, status: res?.status() });
            const text = await p.locator("main").innerText();
            const h1 = await p.locator("h1").first().innerText().catch(() => "");
            check(`${tg} ${pg.url} khong lo khoa dich`, !KEY_LEAK.test(text), text.match(KEY_LEAK)?.[0]);
            const isCode = /^E2E-/.test(h1); // tieu de la ma chung tu (du lieu, khong dich)
            if (loc === "zh" && !isCode) check(`${tg} ${pg.url} tieu de tieng Trung`, CJK.test(h1), h1);
            if (loc === "en" && !isCode) check(`${tg} ${pg.url} tieu de tieng Anh (khong dau Viet)`, !VN.test(h1) && h1.length > 0, h1);
            if (loc === "vi") check(`${tg} ${pg.url} co tieu de`, h1.length > 0, h1);
            if (engine === "iphone") {
              const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
              check(`${tg} ${pg.url} khong tran ngang`, m.sw <= m.iw + 1, m);
            }
            // Che gia: don gia 285.000 chi Quan tri thay
            if (pg.url === `/don-mua/${seed.sentId}`) {
              const seesPrice = /285[.,\s ]?000/.test(await p.content());
              check(`${tg} don mua: gia ${role === "ADMIN" ? "co" : "KHONG"} hien`, seesPrice === (role === "ADMIN"), seesPrice);
            }
            if (pg.priceInputs) {
              const n = await p.locator('input[name^="price_"]').count();
              check(`${tg} bao gia: o nhap gia ${role === "ADMIN" ? "co" : "KHONG"} co`, role === "ADMIN" ? n > 0 : n === 0, n);
            }
          }
          await ctx.close();
        }
      }
      await browser.close();
      console.log(`${engine}: xong`);
    }
  } catch (e) {
    failed++;
    console.log("LOI:", e instanceof Error ? e.message.slice(0, 600) : e);
  } finally {
    await db.session.deleteMany({ where: { userId: { in: Object.values(users).map((u) => u.id) } } });
    await db.supplierUser.deleteMany({ where: { credentialId: cred.id } });
    await db.supplierCredential.delete({ where: { id: cred.id } });
    await db.portalAudit.deleteMany({ where: { supplierId: seed.supplierId } });
    try { crmScript("clean", String(seed.supplierId)); } catch (e) { console.log("don CRM:", e instanceof Error ? e.message.slice(0, 200) : e); }
    console.log(`\n${passed} dat, ${failed} loi`);
    await db.$disconnect();
    process.exit(failed ? 1 : 0);
  }
}
main();
