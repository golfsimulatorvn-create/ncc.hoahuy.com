/**
 * E2E Gia dau vao ngay tren dong don mua / RFQ (specs/064 dot 2): Quan tri thay lai gop + canh bao lo tuc thi khi go gia bao,
 * luu gia dau vao tai cho, Nhan vien dien gia tren don mua (khong thay don gia / lai), 3 ngon ngu, khong tran ngang iPhone 13.
 * Can: cong dev :3200 + CRM dev :3145 (SUPPLIER_PORTAL_HMAC_SECRET = CRM_HMAC_SECRET cua cong), repo CRM o ../hoahuy-ERP-app.
 * Chay: npx tsx scripts/e2e-line-costs.ts [--engine=desktop|iphone]
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
type Seed = { supplierId: number; apiKey: string; sentId: number; rfqId: number; rfqLineIds: number[] };
const seedOnce = () => JSON.parse(crmScript("seed").split("\n").find((l) => l.startsWith("JSON:"))!.slice(5)) as Seed;

const TXT = {
  vi: { saved: "Đã lưu giá đầu vào.", noCost: "Chưa có giá đầu vào", gain: "Lãi gộp 25% · 500", loss: "lỗ 500 mỗi đơn vị", save: "Lưu giá đầu vào" },
  zh: { saved: "已保存进货价。", noCost: "尚无进货价", gain: "毛利率 25% · 500", loss: "每单位亏损 500", save: "保存进货价" },
  en: { saved: "Input price saved.", noCost: "No input price yet", gain: "Gross margin 25% · 500", loss: "loss of 500 per unit", save: "Save input price" },
} as const;

async function main() {
  const { db } = await import("../src/server/db");
  const { encryptSecret, hashPassword, hashToken, randomToken } = await import("../src/server/crypto");
  let seed = seedOnce();
  const tag = `lc${Date.now()}`;
  const cred = await db.supplierCredential.create({ data: { crmSupplierId: seed.supplierId, supplierCode: tag, supplierName: `NCC ${tag}`, apiKeyEnc: encryptSecret(seed.apiKey) } });
  const users: Record<string, { id: number; token: string }> = {};
  for (const r of ["ADMIN", "STAFF"] as const) {
    const u = await db.supplierUser.create({ data: { credentialId: cred.id, email: `${tag}.${r}@test.vn`, displayName: `User ${r}`, role: r, status: "ACTIVE", passwordHash: await hashPassword("MatKhauE2E12345"), locale: "vi" } });
    const token = randomToken(32);
    await db.session.create({ data: { id: hashToken(token), userId: u.id, expiresAt: new Date(Date.now() + 3600_000), lastSeenAt: new Date() } });
    users[r] = { id: u.id, token };
  }
  const ctxFor = async (engine: string, role: string, locale = "vi"): Promise<BrowserContext> => {
    await db.supplierUser.update({ where: { id: users[role].id }, data: { locale } });
    const b = engine === "desktop" ? await chromium.launch() : await webkit.launch(process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {});
    const ctx = await b.newContext(engine === "iphone" ? { ...devices["iPhone 13"] } : { viewport: { width: 1366, height: 900 } });
    await ctx.addCookies([{ name: "hh_ncc_session", value: users[role].token, url: BASE }, { name: "HH_LOCALE", value: locale, url: BASE }]);
    return ctx;
  };
  const flash = async (p: Page) => { const el = p.locator('main [role="status"], main [role="alert"]').first(); await el.waitFor({ timeout: 15000 }); return el.innerText(); };
  const noOverflow = async (p: Page) => { const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); return m.sw <= m.iw + 1 ? true : m; };

  try {
    for (const engine of (["desktop", "iphone"] as const).filter((e) => ENGINE === "all" || e === ENGINE)) {
      const tg = `[${engine}]`;
      if (engine !== "desktop" || ENGINE === "iphone") {
        const s2 = seedOnce();
        await db.supplierCredential.update({ where: { id: cred.id }, data: { crmSupplierId: s2.supplierId, apiKeyEnc: encryptSecret(s2.apiKey) } });
        crmScript("clean", String(seed.supplierId));
        seed = s2;
      }
      const [lineA] = seed.rfqLineIds;

      // ---- Quan tri: RFQ, lai gop tuc thi
      let ctx = await ctxFor(engine, "ADMIN");
      let p = await ctx.newPage();
      await p.goto(`${BASE}/bao-gia/${seed.rfqId}`);
      await p.waitForSelector(`#price_${lineA}`, { timeout: 30000 });
      await p.waitForTimeout(1200); // cho hydrate
      const rowA = p.locator("tr", { has: p.locator(`#price_${lineA}`) });
      await p.fill(`#price_${lineA}`, "2000");
      check(`${tg} RFQ: chua co gia dau vao -> nhac nhap`, (await rowA.innerText()).includes(TXT.vi.noCost), await rowA.innerText());
      await p.fill("#cost_p_0", "1.500");
      check(`${tg} RFQ: bao 2000, von 1.500 -> lai gop 25% · 500`, (await rowA.innerText()).includes(TXT.vi.gain), await rowA.innerText());
      await p.fill("#cost_p_0", "2500");
      check(`${tg} RFQ: von 2500 > bao 2000 -> canh bao lo 500`, (await rowA.innerText()).includes(TXT.vi.loss), await rowA.innerText());
      await p.selectOption("#cost_cur_0", "USD");
      check(`${tg} RFQ: khac loai tien -> khong tinh lai`, (await rowA.innerText()).includes("Khác loại tiền"), await rowA.innerText());
      await p.selectOption("#cost_cur_0", "VND");
      await p.fill("#cost_p_0", "1500");
      const h = (await p.locator("#cost_p_0").boundingBox())?.height ?? 0;
      check(`${tg} o gia dau vao cao >= 44px (${Math.round(h)})`, h >= 43.5, h);
      if (engine === "iphone") check(`${tg} RFQ khong tran ngang`, (await noOverflow(p)) === true, await noOverflow(p));
      await Promise.all([p.waitForURL(/ok=costSaved/), p.click(`button:has-text("${TXT.vi.save}")`)]);
      check(`${tg} RFQ: luu gia dau vao -> thong bao thanh cong`, (await flash(p)).includes(TXT.vi.saved));
      check(`${tg} RFQ: sau khi tai lai o gia con 1500`, (await p.locator("#cost_p_0").inputValue()) === "1500", await p.locator("#cost_p_0").inputValue());
      // gia dau vao KHONG lam doi don gia bao dang go (form khac nhau)
      check(`${tg} RFQ: don gia bao chua nop van trong`, (await p.locator(`#price_${lineA}`).inputValue()) === "");

      // ---- Quan tri: don mua, lai gop sau khi luu
      await p.goto(`${BASE}/don-mua/${seed.sentId}`);
      await p.waitForSelector("#cost_p_0", { timeout: 30000 });
      await p.waitForTimeout(800);
      await p.fill("#cost_p_0", "200.000");
      await Promise.all([p.waitForURL(/ok=costSaved/), p.click(`button:has-text("${TXT.vi.save}")`)]);
      await flash(p);
      let vis = await p.locator("main").innerText();
      check(`${tg} don mua / ADMIN: luu 200.000 -> lai gop 29,8%`, vis.includes(TXT.vi.saved) && /29,8%/.test(vis) && (await p.locator("#cost_p_0").inputValue()) === "200000", vis.slice(0, 300));
      await p.fill("#cost_p_0", "abc");
      await Promise.all([p.waitForURL(/err=costInvalid/), p.click(`button:has-text("${TXT.vi.save}")`)]);
      check(`${tg} don mua: gia sai -> bao loi, khong luu`, (await flash(p)).includes("Giá đầu vào không hợp lệ"));
      if (engine === "iphone") check(`${tg} don mua khong tran ngang`, (await noOverflow(p)) === true, await noOverflow(p));
      await ctx.browser()?.close();

      // ---- Nhan vien: dien gia tren don mua, khong thay don gia / lai
      ctx = await ctxFor(engine, "STAFF");
      p = await ctx.newPage();
      await p.goto(`${BASE}/don-mua/${seed.sentId}`);
      await p.waitForSelector("#cost_p_0", { timeout: 30000 });
      await p.waitForTimeout(800);
      const html = await p.content();
      check(`${tg} STAFF: co o gia dau vao, KHONG thay don gia 285.000 / lai`, !/285[.,]?000/.test(html) && !/29,8%/.test(html), html.match(/.{60}(285[.,]?000|29,8%).{60}/s)?.[0]);
      await p.fill("#cost_p_1", "150.000");
      await Promise.all([p.waitForURL(/ok=costSaved/), p.click(`button:has-text("${TXT.vi.save}")`)]);
      check(`${tg} STAFF: luu gia dau vao dong 2`, (await p.locator("#cost_p_1").inputValue()) === "150000" && (await p.locator("#cost_p_0").inputValue()) === "200000");
      await p.goto(`${BASE}/bao-gia/${seed.rfqId}`);
      await p.waitForSelector("#cost_p_0", { timeout: 30000 });
      check(`${tg} STAFF: RFQ khong co o don gia bao, khong co goi y lai`, (await p.locator(`#price_${lineA}`).count()) === 0 && (await p.locator('[role="status"].chip').count()) === 0);
      await ctx.browser()?.close();

      // ---- 3 ngon ngu (Quan tri, RFQ)
      for (const loc of ["zh", "en"] as const) {
        ctx = await ctxFor(engine, "ADMIN", loc);
        p = await ctx.newPage();
        await p.goto(`${BASE}/bao-gia/${seed.rfqId}`);
        await p.waitForSelector(`#price_${lineA}`, { timeout: 30000 });
        await p.waitForTimeout(1200);
        await p.fill(`#price_${lineA}`, "2000");
        await p.fill("#cost_p_0", "1500");
        vis = await p.locator("tr", { has: p.locator(`#price_${lineA}`) }).innerText();
        check(`${tg} [${loc}] lai gop tuc thi dich du`, vis.includes(TXT[loc].gain) && !/margin\.|rfq\./.test(vis), vis);
        await p.fill("#cost_p_0", loc === "zh" ? "2500" : "2600");
        check(`${tg} [${loc}] canh bao lo dich du`, (await p.locator("main").innerText()).includes(loc === "zh" ? TXT[loc].loss : "loss of 600"));
        await Promise.all([p.waitForURL(/ok=costSaved/), p.click(`button:has-text("${TXT[loc].save}")`)]);
        check(`${tg} [${loc}] thong bao luu dich du`, (await flash(p)).includes(TXT[loc].saved));
        if (engine === "iphone") check(`${tg} [${loc}] khong tran ngang`, (await noOverflow(p)) === true, await noOverflow(p));
        await ctx.browser()?.close();
      }
    }
  } catch (e) {
    failed++;
    console.log("LOI:", e instanceof Error ? e.message.slice(0, 600) : e);
  } finally {
    await db.session.deleteMany({ where: { userId: { in: Object.values(users).map((u) => u.id) } } });
    await db.supplierUser.deleteMany({ where: { credentialId: cred.id } });
    await db.supplierCredential.delete({ where: { id: cred.id } });
    await db.portalAudit.deleteMany({ where: { supplierId: { in: [seed.supplierId] } } });
    try { crmScript("clean", String(seed.supplierId)); } catch { /* da don */ }
    console.log(`\n${passed} dat, ${failed} loi`);
    await db.$disconnect();
    process.exit(failed ? 1 : 0);
  }
}
main();
