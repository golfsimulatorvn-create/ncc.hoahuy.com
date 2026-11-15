/**
 * E2E Cong no Cong NCC (specs/054 T084): Quan tri thay so du khop so cai (600.000), khoan qua han, sao ke ky,
 * xac nhan khop / bao lech (bat buoc ghi chu) + lich su; Nhan vien / Chi xem / Xem gia dau vao KHONG vao duoc man nay.
 * Can: cong dev :3200 + CRM dev (xem e2e-orders.ts). Chay: npx tsx scripts/e2e-payables.ts [--engine=desktop|iphone]
 */
try { process.loadEnvFile(".env"); } catch { /* da co bien */ }
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium, devices, webkit, type BrowserContext, type Page } from "@playwright/test";

const BASE = "http://localhost:3200";
const ENGINE = process.argv.find((a) => a.startsWith("--engine="))?.slice(9) ?? "all";
const CRM_DIR = path.resolve(process.cwd(), "..", "hoahuy-ERP-app");
let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`OK    ${name}`); } else { failed++; console.log(`FAIL  ${name}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`); }
}
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !["DATABASE_URL", "TOKEN_PEPPER", "CRED_ENC_KEY"].includes(k))) as unknown as NodeJS.ProcessEnv;
const crmScript = (...a: string[]) => execFileSync("npx", ["tsx", "scripts/_e2e-portal-orders-seed.ts", ...a], { cwd: CRM_DIR, encoding: "utf8", shell: true, env: cleanEnv });

async function act(p: Page, click: () => Promise<unknown>, re: RegExp, sel: string) {
  await Promise.all([p.waitForURL(re, { timeout: 20000 }), click()]);
  await p.waitForSelector(sel, { timeout: 15000 });
}

async function main() {
  const { db } = await import("../src/server/db");
  const { encryptSecret, hashPassword, hashToken, randomToken } = await import("../src/server/crypto");
  const seed = JSON.parse(crmScript("seed").split("\n").find((l) => l.startsWith("JSON:"))!.slice(5)) as { supplierId: number; apiKey: string };
  crmScript("seed-ap", String(seed.supplierId));
  const tag = `ep${Date.now()}`;
  const cred = await db.supplierCredential.create({ data: { crmSupplierId: seed.supplierId, supplierCode: tag, supplierName: `NCC ${tag}`, apiKeyEnc: encryptSecret(seed.apiKey) } });
  const users: Record<string, { id: number; token: string }> = {};
  for (const r of ["ADMIN", "STAFF", "VIEWER", "COST_VIEWER"] as const) {
    const u = await db.supplierUser.create({ data: { credentialId: cred.id, email: `${tag}.${r}@test.vn`, displayName: `User ${r}`, role: r, status: "ACTIVE", passwordHash: await hashPassword("MatKhauE2E12345"), locale: "vi" } });
    const token = randomToken(32);
    await db.session.create({ data: { id: hashToken(token), userId: u.id, expiresAt: new Date(Date.now() + 3600_000), lastSeenAt: new Date() } });
    users[r] = { id: u.id, token };
  }
  const ctxFor = async (engine: string, role: string): Promise<BrowserContext> => {
    const b = engine === "desktop" ? await chromium.launch() : await webkit.launch(process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {});
    const ctx = await b.newContext(engine === "iphone" ? { ...devices["iPhone 13"] } : { viewport: { width: 1366, height: 900 } });
    await ctx.addCookies([{ name: "hh_ncc_session", value: users[role].token, url: BASE }, { name: "HH_LOCALE", value: "vi", url: BASE }]);
    return ctx;
  };
  const STATUS = 'p[role="status"]', ALERT = 'p[role="alert"]';
  const range = "tu=2026-11-01&den=2026-11-30";

  try {
    for (const engine of (["desktop", "iphone"] as const).filter((e) => ENGINE === "all" || e === ENGINE)) {
      const tg = `[${engine}]`;
      let ctx = await ctxFor(engine, "ADMIN");
      let p = await ctx.newPage();
      await p.goto(`${BASE}/cong-no?${range}`);
      let main = await p.locator("main").innerText();
      check(`${tg} ADMIN con phai tra 600.000 (khop so cai), qua han 600.000`, (main.match(/600\.000/g) ?? []).length >= 2, main.slice(0, 300));
      check(`${tg} khoan AA26P-E2E1: 1.000.000 / da tra 400.000 / qua han`, main.includes("AA26P-E2E1") && main.includes("1.000.000") && main.includes("400.000") && (await p.locator(".chip", { hasText: "Quá hạn" }).count()) > 0);
      if (engine === "iphone") { const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); check(`${tg} cong no khong tran ngang`, m.sw <= m.iw + 1, m); }
      check(`${tg} ky 11/2026: dau 1.000.000, cuoi 600.000`, /Đầu kỳ[\s\S]*1\.000\.000/.test(main) && /Cuối kỳ[\s\S]*600\.000/.test(main));
      // Bao lech khong ghi chu
      await act(p, () => p.click('button:text-is("Báo lệch")'), /err=needNote/, ALERT);
      check(`${tg} bao lech khong ghi chu -> bi chan`, (await p.locator(ALERT).innerText()).includes("ghi chú lý do"));
      // Xac nhan khop
      await act(p, () => p.click('button:text-is("Xác nhận khớp")'), /ok=confirmed/, STATUS);
      check(`${tg} xac nhan khop -> lich su co dong "Đã khớp"`, (await p.locator(".chip", { hasText: "Đã khớp" }).count()) === 1);
      // Bao lech co ghi chu
      await p.fill('input[name="note"]', "Thieu phieu chi ngay 05/11");
      await act(p, () => p.click('button:text-is("Báo lệch")'), /ok=disputed/, STATUS);
      main = await p.locator("main").innerText();
      check(`${tg} bao lech co ghi chu -> lich su co "Báo lệch" + ghi chu`, (await p.locator(".chip", { hasText: "Báo lệch" }).count()) === 1 && main.includes("Thieu phieu chi"));
      await ctx.browser()?.close();

      for (const role of ["STAFF", "VIEWER", "COST_VIEWER"] as const) {
        ctx = await ctxFor(engine, role);
        p = await ctx.newPage();
        await p.goto(`${BASE}/cong-no?${range}`);
        const html = await p.content();
        check(`${tg} ${role} khong vao duoc Cong no (chuyen trang) va khong lo so`, !/\/cong-no/.test(p.url()) && !/AA26P-E2E1/.test(html) && !/600\.000/.test(html), p.url());
        await ctx.browser()?.close();
      }
    }
  } catch (e) {
    failed++;
    console.log("LOI:", e instanceof Error ? e.message.slice(0, 500) : e);
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
