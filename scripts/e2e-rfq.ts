/**
 * E2E Yeu cau bao gia Cong NCC (specs/054 T063): Quan tri luu nhap + nop (thieu dong thi chan), RFQ qua han khong nhap duoc,
 * Nhan vien / Chi xem KHONG thay o gia, khong tran ngang tren iPhone. Dung chung du lieu mau voi e2e-orders (CRM seed).
 * Can: cong dev :3200 + CRM dev (SUPPLIER_PORTAL_HMAC_SECRET = CRM_HMAC_SECRET cua cong), CRM_BASE_URL tro dung CRM.
 * Chay: npx tsx scripts/e2e-rfq.ts [--engine=desktop|iphone]   (WEBKIT_PATH=<Playwright.exe> cho iPhone)
 */
try { process.loadEnvFile(".env"); } catch { /* da co bien */ }
import { execFileSync } from "node:child_process";
import path from "node:path";
import { chromium, devices, webkit, type BrowserContext } from "@playwright/test";

const BASE = "http://localhost:3200";
const ENGINE = process.argv.find((a) => a.startsWith("--engine="))?.slice(9) ?? "all";
const CRM_DIR = path.resolve(process.cwd(), "..", "hoahuy-ERP-app");
let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`OK    ${name}`); } else { failed++; console.log(`FAIL  ${name}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`); }
}
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !["DATABASE_URL", "TOKEN_PEPPER", "CRED_ENC_KEY"].includes(k))) as unknown as NodeJS.ProcessEnv;
const crmScript = (...a: string[]) => execFileSync("npx", ["tsx", "scripts/_e2e-portal-orders-seed.ts", ...a], { cwd: CRM_DIR, encoding: "utf8", shell: true, env: cleanEnv });
type Seed = { supplierId: number; apiKey: string; rfqId: number; rfqCode: string; rfqLineIds: number[]; rfqOldId: number };

async function main() {
  const { db } = await import("../src/server/db");
  const { encryptSecret, hashPassword, hashToken, randomToken } = await import("../src/server/crypto");
  const seed = JSON.parse(crmScript("seed").split("\n").find((l) => l.startsWith("JSON:"))!.slice(5)) as Seed;
  const tag = `er${Date.now()}`;
  const cred = await db.supplierCredential.create({ data: { crmSupplierId: seed.supplierId, supplierCode: tag, supplierName: `NCC ${tag}`, apiKeyEnc: encryptSecret(seed.apiKey) } });
  const users: Record<string, { id: number; token: string }> = {};
  for (const r of ["ADMIN", "STAFF", "VIEWER"] as const) {
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

  try {
    for (const engine of (["desktop", "iphone"] as const).filter((e) => ENGINE === "all" || e === ENGINE)) {
      const tg = `[${engine}]`;
      let ctx = await ctxFor(engine, "ADMIN");
      let p = await ctx.newPage();
      await p.goto(`${BASE}/bao-gia`);
      check(`${tg} ADMIN danh sach co RFQ, nhan "Chờ báo giá" + "Quá hạn"`, (await p.locator(".chip", { hasText: "Chờ báo giá" }).count()) === 1 && (await p.locator(".chip", { hasText: "Quá hạn" }).count()) === 1);
      await p.goto(`${BASE}/bao-gia/${seed.rfqId}`);
      const [l1, l2] = seed.rfqLineIds;
      check(`${tg} ADMIN co o nhap gia`, (await p.locator(`input[name="price_${l1}"]`).count()) === 1);
      if (engine === "iphone") { const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); check(`${tg} bao gia khong tran ngang`, m.sw <= m.iw + 1, m); }

      // Luu nhap chi 1 dong
      await p.fill(`input[name="price_${l1}"]`, "12500");
      await p.fill(`input[name="lead_${l1}"]`, "21");
      await Promise.all([p.waitForURL(/ok=draft/, { timeout: 20000 }), p.click('button[value="draft"]')]);
      await p.waitForSelector('p[role="status"]', { timeout: 15000 });
      check(`${tg} luu nhap -> thong bao`, (await p.locator('p[role="status"]', { hasText: "Đã lưu nháp" }).count()) > 0, p.url());
      check(`${tg} sau luu nhap gia + ngay giao van con`, (await p.locator(`input[name="price_${l1}"]`).inputValue()) === "12500" && (await p.locator(`input[name="lead_${l1}"]`).inputValue()) === "21");
      // Nop thieu dong 2 -> chan
      await Promise.all([p.waitForURL(/err=missing/, { timeout: 20000 }), p.click('button[value="submit"]')]);
      await p.waitForSelector('p[role="alert"]', { timeout: 15000 });
      check(`${tg} nop thieu dong -> bao loi, chua nop`, (await p.locator('p[role="alert"]', { hasText: "mọi dòng" }).count()) > 0 && (await p.locator(".chip", { hasText: "Chờ báo giá" }).count()) === 1, (await p.locator("main").innerText()).slice(0, 300));
      // Nop du
      await p.fill(`input[name="price_${l2}"]`, "90000");
      await Promise.all([p.waitForURL(/ok=submitted/, { timeout: 20000 }), p.click('button[value="submit"]')]);
      await p.waitForSelector('p[role="status"]', { timeout: 15000 });
      check(`${tg} nop du -> "Đã nộp"`, (await p.locator('p[role="status"]', { hasText: "Đã nộp báo giá" }).count()) > 0 && (await p.locator(".chip", { hasText: "Đã nộp" }).count()) > 0, (await p.locator("main").innerText()).slice(0, 300));
      // Qua han
      await p.goto(`${BASE}/bao-gia/${seed.rfqOldId}`);
      check(`${tg} RFQ qua han: khong con o nhap gia / nut nop`, (await p.locator('input[name^="price_"]').count()) === 0 && (await p.locator('button[value="submit"]').count()) === 0);
      await p.goto(`${BASE}/bao-gia/999999999`);
      check(`${tg} RFQ khong ton tai -> 404`, /404|could not be found/i.test(await p.content()));
      await ctx.browser()?.close();

      for (const role of ["STAFF", "VIEWER"] as const) {
        ctx = await ctxFor(engine, role);
        p = await ctx.newPage();
        await p.goto(`${BASE}/bao-gia/${seed.rfqId}`);
        const html = await p.content();
        check(`${tg} ${role} thay RFQ nhung KHONG co o gia/nut nop`, (await p.locator('input[name^="price_"]').count()) === 0 && (await p.locator('button[value="submit"]').count()) === 0 && html.includes("Cell LFP bao gia"));
        check(`${tg} ${role} KHONG lo gia da nop (12500/90000)`, !/\b(12[.,]?500|90[.,]?000)\b/.test(html));
        check(`${tg} ${role} co thong bao chi Quan tri`, (await p.locator("main").innerText()).includes("Chỉ Quản trị NCC"));
        await ctx.browser()?.close();
      }
    }
  } catch (e) {
    failed++;
    console.log("LOI:", e instanceof Error ? e.message.slice(0, 400) : e);
  } finally {
    await db.session.deleteMany({ where: { userId: { in: Object.values(users).map((u) => u.id) } } });
    await db.supplierUser.deleteMany({ where: { credentialId: cred.id } });
    await db.supplierCredential.delete({ where: { id: cred.id } });
    await db.portalAudit.deleteMany({ where: { supplierId: seed.supplierId } });
    try { crmScript("clean", String(seed.supplierId)); } catch { /* da don */ }
    console.log(`\n${passed} dat, ${failed} loi`);
    await db.$disconnect();
    process.exit(failed ? 1 : 0);
  }
}
main();
