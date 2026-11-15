/**
 * E2E Gia dau vao Cong NCC (specs/054 T072): Quan tri them NCC thu cap / don gia / so no, xoa bi chan khi con no;
 * Nhan vien sua duoc nhung KHONG xoa; Xem gia dau vao chi doc + chi thay menu Gia dau vao; Chi xem bi chuyen khoi man nay.
 * Can: cong dev :3200 + CRM dev (xem e2e-orders.ts). Chay: npx tsx scripts/e2e-costs.ts [--engine=desktop|iphone]
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

/** Bam nut roi cho URL doi sang ?ok= / ?err= va thong bao hien ra. */
async function act(p: Page, click: () => Promise<unknown>, re: RegExp, sel: string) {
  await Promise.all([p.waitForURL(re, { timeout: 20000 }), click()]);
  await p.waitForSelector(sel, { timeout: 15000 });
}

async function main() {
  const { db } = await import("../src/server/db");
  const { encryptSecret, hashPassword, hashToken, randomToken } = await import("../src/server/crypto");
  const seed = JSON.parse(crmScript("seed").split("\n").find((l) => l.startsWith("JSON:"))!.slice(5)) as { supplierId: number; apiKey: string };
  const tag = `ec${Date.now()}`;
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
    await ctx.addCookies([{ name: "hh_ncc_session", value: users[role].token, url: BASE }, { name: "HH_LOCALE", value: "vi" , url: BASE }]);
    return ctx;
  };
  const STATUS = 'p[role="status"]', ALERT = 'p[role="alert"]';

  try {
    for (const engine of (["desktop", "iphone"] as const).filter((e) => ENGINE === "all" || e === ENGINE)) {
      const tg = `[${engine}]`;
      let ctx = await ctxFor(engine, "ADMIN");
      let p = await ctx.newPage();
      await p.goto(`${BASE}/gia-dau-vao`);
      check(`${tg} ADMIN thay thong bao du lieu rieng + form them`, (await p.locator("main").innerText()).includes("dữ liệu riêng") || (await p.locator("main").innerText()).includes("dữ liệu riêng của công ty"));
      await p.fill('input[name="name"]', `NCC thu cap ${tag}`);
      await p.fill('input[name="contactName"]', "Anh Ba");
      await act(p, () => p.click('form:has(input[name="contactName"]) button[type="submit"]'), /\/gia-dau-vao\/\d+\?ok=created/, STATUS);
      const detailUrl = p.url().split("?")[0];
      check(`${tg} them NCC thu cap -> vao trang chi tiet`, /\/gia-dau-vao\/\d+$/.test(detailUrl));
      if (engine === "iphone") { const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); check(`${tg} chi tiet khong tran ngang`, m.sw <= m.iw + 1, m); }

      // Them gia
      const addForm = 'form:has(button:text-is("Thêm dòng giá"))';
      await p.fill(`${addForm} input[name="itemName"]`, "Cell A grade");
      await p.fill(`${addForm} input[name="unit"]`, "cell");
      await p.fill(`${addForm} input[name="unitPrice"]`, "250000");
      await act(p, () => p.click(`${addForm} button[type="submit"]`), /ok=priceSaved/, STATUS);
      check(`${tg} them don gia -> hien trong bang`, (await p.locator('input[name="itemName"][value="Cell A grade"]').count()) === 1);
      // Sua gia
      const rowForm = 'form:has(input[name="itemId"])';
      await p.fill(`${rowForm} input[name="unitPrice"]`, "260000");
      await act(p, () => p.click(`${rowForm} button[type="submit"]`), /ok=priceSaved/, STATUS);
      check(`${tg} sua don gia -> 260000`, (await p.locator(`${rowForm} input[name="unitPrice"]`).inputValue()) === "260000");
      // So cong no: no 5.000.000
      const led = 'form:has(button:text-is("Thêm dòng sổ"))';
      await p.fill(`${led} input[name="description"]`, "Nhap cell");
      await p.fill(`${led} input[name="debitAmount"]`, "5000000");
      await act(p, () => p.click(`${led} button[type="submit"]`), /ok=ledgerAdded/, STATUS);
      check(`${tg} them dong no -> cong no 5.000.000`, /5\.000\.000/.test(await p.locator("main").innerText()));
      // Nhap ca no va tra -> loi
      await p.fill(`${led} input[name="description"]`, "Sai");
      await p.fill(`${led} input[name="debitAmount"]`, "1");
      await p.fill(`${led} input[name="creditAmount"]`, "1");
      await act(p, () => p.click(`${led} button[type="submit"]`), /err=invalidLedger/, ALERT);
      check(`${tg} nhap ca no va tra -> bao loi`, (await p.locator(ALERT).innerText()).includes("đúng một số tiền"));
      // Xoa khi con no -> chan
      await act(p, () => p.click('form:has(button:text-is("Xóa nhà cung cấp")) button'), /err=hasDebt/, ALERT);
      check(`${tg} xoa NCC khi con no -> bi chan`, (await p.locator(ALERT).innerText()).includes("Còn công nợ"));
      // Tra het -> xoa duoc
      await p.fill(`${led} input[name="description"]`, "Tra tien");
      await p.fill(`${led} input[name="creditAmount"]`, "5000000");
      await act(p, () => p.click(`${led} button[type="submit"]`), /ok=ledgerAdded/, STATUS);
      // xoa dong gia
      await act(p, () => p.click('form:has(input[name="itemId"]) ~ td form button, td form:has(button:text-is("Xóa")) button'), /ok=priceDeleted/, STATUS);
      check(`${tg} xoa dong gia`, (await p.locator('input[name="itemName"][value="Cell A grade"]').count()) === 0);
      // Giu lai 1 gia cho STAFF/COST_VIEWER xem: them lai
      await p.fill(`${addForm} input[name="itemName"]`, "BMS 16S");
      await p.fill(`${addForm} input[name="unit"]`, "cai");
      await p.fill(`${addForm} input[name="unitPrice"]`, "99000");
      await act(p, () => p.click(`${addForm} button[type="submit"]`), /ok=priceSaved/, STATUS);
      await ctx.browser()?.close();

      // STAFF: sua duoc, khong xoa duoc
      ctx = await ctxFor(engine, "STAFF");
      p = await ctx.newPage();
      await p.goto(detailUrl);
      check(`${tg} STAFF co form sua gia + them dong so`, (await p.locator('input[name="itemId"]').count()) === 1 && (await p.locator('button:text-is("Thêm dòng sổ")').count()) === 1);
      check(`${tg} STAFF KHONG co nut Xoa (gia / nha cung cap)`, (await p.locator('button:text-is("Xóa")').count()) === 0 && (await p.locator('button:text-is("Xóa nhà cung cấp")').count()) === 0);
      await ctx.browser()?.close();

      // COST_VIEWER: chi doc
      ctx = await ctxFor(engine, "COST_VIEWER");
      p = await ctx.newPage();
      await p.goto(`${BASE}/don-mua`);
      check(`${tg} COST_VIEWER vao /don-mua bi chuyen ve Gia dau vao`, /\/gia-dau-vao/.test(p.url()), p.url());
      const navLinks = await p.locator("nav[aria-label] a").allInnerTexts();
      check(`${tg} COST_VIEWER chi co 1 muc menu`, navLinks.length === 1 && navLinks[0].includes("Giá đầu vào"), navLinks);
      check(`${tg} COST_VIEWER khong co form them NCC`, (await p.locator('input[name="contactName"]').count()) === 0);
      await p.goto(detailUrl);
      check(`${tg} COST_VIEWER thay gia nhung KHONG co o nhap / nut`, (await p.locator("main").innerText()).includes("BMS 16S") && (await p.locator("main form").count()) === 0);
      await ctx.browser()?.close();

      // VIEWER: khong co quyen costs
      ctx = await ctxFor(engine, "VIEWER");
      p = await ctx.newPage();
      await p.goto(`${BASE}/gia-dau-vao`);
      check(`${tg} VIEWER vao Gia dau vao -> chuyen ve don mua`, /\/don-mua/.test(p.url()), p.url());
      await ctx.browser()?.close();
      // NCC thu cap con lai cho vong iPhone: tao moi, khong dung lai
    }
  } catch (e) {
    failed++;
    console.log("LOI:", e instanceof Error ? e.message.slice(0, 500) : e);
  } finally {
    await db.session.deleteMany({ where: { userId: { in: Object.values(users).map((u) => u.id) } } });
    await db.supplierUser.deleteMany({ where: { credentialId: cred.id } });
    await db.supplierCredential.delete({ where: { id: cred.id } });
    await db.portalAudit.deleteMany({ where: { supplierId: seed.supplierId } });
    try { await cleanSubVendors(seed.supplierId); crmScript("clean", String(seed.supplierId)); } catch (e) { console.log("don CRM:", e instanceof Error ? e.message.slice(0, 200) : e); }
    console.log(`\n${passed} dat, ${failed} loi`);
    await db.$disconnect();
    process.exit(failed ? 1 : 0);
  }
}

/** Don NCC thu cap + dong gia + so no tao trong luc test (bang chi co o CRM). */
async function cleanSubVendors(supplierId: number) {
  execFileSync("npx", ["tsx", "scripts/_e2e-portal-orders-seed.ts", "clean-sub", String(supplierId)], { cwd: CRM_DIR, encoding: "utf8", shell: true, env: cleanEnv });
}
main();
