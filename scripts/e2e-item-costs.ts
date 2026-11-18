/**
 * E2E Gia dau vao theo ma hang Hoa Huy (specs/064): Nhan vien dien gia theo lo (khong thay gia ban / lai), Quan tri thay them
 * gia ban + lai gop + lich su, Xem gia von chi doc, don mua hien gia dau vao, 3 ngon ngu, khong tran ngang tren iPhone 13.
 * Can: cong dev :3200 + CRM dev :3145 (SUPPLIER_PORTAL_HMAC_SECRET = CRM_HMAC_SECRET cua cong), repo CRM o ../hoahuy-ERP-app.
 * Chay: npx tsx scripts/e2e-item-costs.ts [--engine=desktop|iphone]
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
type Seed = { supplierId: number; apiKey: string; sentId: number };
const seedOnce = () => JSON.parse(crmScript("seed").split("\n").find((l) => l.startsWith("JSON:"))!.slice(5)) as Seed;

const TXT = {
  vi: { tab: "Theo mã hàng Hoa Huy", cost: "Giá đầu vào", sell: "Giá bán Hoa Huy", gross: "Lãi gộp", saved: "Đã lưu giá đầu vào." },
  zh: { tab: "按华辉物料编码", cost: "进货价", sell: "售给华辉的价格", gross: "毛利", saved: "已保存进货价。" },
  en: { tab: "By Hoa Huy item code", cost: "Input price", sell: "Price to Hoa Huy", gross: "Gross margin", saved: "Input prices saved." },
} as const;

async function main() {
  const { db } = await import("../src/server/db");
  const { encryptSecret, hashPassword, hashToken, randomToken } = await import("../src/server/crypto");
  let seed = seedOnce();
  const tag = `ic${Date.now()}`;
  const cred = await db.supplierCredential.create({ data: { crmSupplierId: seed.supplierId, supplierCode: tag, supplierName: `NCC ${tag}`, apiKeyEnc: encryptSecret(seed.apiKey) } });
  const users: Record<string, { id: number; token: string }> = {};
  for (const r of ["ADMIN", "STAFF", "VIEWER", "COST_VIEWER"] as const) {
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

      // ---- Nhan vien: dien gia theo lo, KHONG thay gia ban / lai
      let ctx = await ctxFor(engine, "STAFF");
      let p = await ctx.newPage();
      await p.goto(`${BASE}/gia-dau-vao/theo-ma`);
      await p.waitForSelector("table", { timeout: 30000 });
      let html = await p.content();
      let vis = await p.locator("main").innerText();
      check(`${tg} STAFF thay tab + 4 ma tu don mua / RFQ`, vis.includes(TXT.vi.tab) && ["VT-A", "VT-B", "VT-1", "VT-2"].every((c) => vis.includes(c)), vis.slice(0, 200));
      check(`${tg} STAFF KHONG thay cot gia ban / lai (chu + du lieu tho)`, !vis.toLowerCase().includes(TXT.vi.sell.toLowerCase()) && !vis.toLowerCase().includes(TXT.vi.gross.toLowerCase()) && !/285[.,]?000/.test(html));
      if (engine === "iphone") check(`${tg} STAFF khong tran ngang`, (await noOverflow(p)) === true, await noOverflow(p));
      const priceInput = (code: string) => p.locator(`tr:has-text("${code}") input[name^="p_"]`);
      const h = (await priceInput("VT-A").boundingBox())?.height ?? 0;
      check(`${tg} o gia cao >= 44px (${Math.round(h)})`, h >= 43.5, h);
      await priceInput("VT-A").fill("200.000");
      await priceInput("VT-B").fill("150000");
      await Promise.all([p.waitForURL(/ok=costSaved/, { timeout: 20000 }), p.click('button:has-text("Lưu giá đầu vào")')]);
      await p.waitForSelector('p[role="status"]');
      check(`${tg} luu theo lo -> thong bao da luu`, (await p.locator('p[role="status"]').innerText()).includes(TXT.vi.saved));
      check(`${tg} gia hien lai sau khi luu (200000 / 150000)`, (await priceInput("VT-A").inputValue()) === "200000" && (await priceInput("VT-B").inputValue()) === "150000");
      await p.goto(`${BASE}/gia-dau-vao/theo-ma?missing=1`);
      vis = await p.locator("main").innerText();
      check(`${tg} loc 'chua co gia' chi con VT-1, VT-2`, vis.includes("VT-1") && vis.includes("VT-2") && !vis.includes("VT-A") && !vis.includes("VT-B"));
      await p.goto(`${BASE}/gia-dau-vao/theo-ma?q=cell%20pin`);
      vis = await p.locator("main").innerText();
      check(`${tg} tim khong dau 'cell pin' ra VT-A`, vis.includes("VT-A") && !vis.includes("VT-B"));
      // gia sai -> bao loi, khong ghi
      await p.goto(`${BASE}/gia-dau-vao/theo-ma`);
      await priceInput("VT-1").fill("abc");
      await Promise.all([p.waitForURL(/err=invalid/, { timeout: 20000 }), p.click('button:has-text("Lưu giá đầu vào")')]);
      await p.waitForSelector('p[role="alert"]', { timeout: 15000 });
      check(`${tg} gia khong hop le -> bao loi`, (await p.locator('p[role="alert"]').count()) === 1);
      // don mua: STAFF thay gia dau vao dong VT-A, khong thay don gia
      await p.goto(`${BASE}/don-mua/${seed.sentId}`);
      vis = await p.locator("main").innerText();
      html = await p.content();
      check(`${tg} don mua / STAFF: co cot Gia dau vao + 200.000, khong co don gia`, vis.toLowerCase().includes(TXT.vi.cost.toLowerCase()) && /200\.000/.test(vis) && !/285[.,]?000/.test(html) && !vis.includes("Đơn giá"), vis.slice(0, 300));
      await ctx.browser()?.close();

      // ---- Quan tri: gia ban + lai gop + lich su
      ctx = await ctxFor(engine, "ADMIN");
      p = await ctx.newPage();
      await p.goto(`${BASE}/gia-dau-vao/theo-ma`);
      await p.waitForSelector("table", { timeout: 30000 });
      vis = await p.locator("main").innerText();
      const rowA = await p.locator('tr:has-text("VT-A")').innerText();
      check(`${tg} ADMIN thay cot gia ban + lai gop`, vis.toLowerCase().includes(TXT.vi.sell.toLowerCase()) && vis.toLowerCase().includes(TXT.vi.gross.toLowerCase()));
      check(`${tg} ADMIN: VT-A gia ban 285.000 va lai 29,8%`, /285\.000/.test(rowA) && /29,8%/.test(rowA), rowA);
      check(`${tg} ADMIN: VT-1 chua co gia dau vao -> lai "—"`, (await p.locator('tr:has-text("VT-1")').innerText()).includes("—"));
      if (engine === "iphone") check(`${tg} ADMIN khong tran ngang`, (await noOverflow(p)) === true, await noOverflow(p));
      await p.click('tr:has-text("VT-A") >> text=Lịch sử');
      await p.waitForURL(/hist=VT-A/);
      const hv = await p.locator("main").innerText();
      check(`${tg} lich su doi gia hien dong "chua co → 200.000"`, /chưa có/.test(hv) && /200\.000/.test(hv), hv.slice(-200));
      await p.goto(`${BASE}/don-mua/${seed.sentId}`);
      vis = await p.locator("main").innerText();
      check(`${tg} don mua / ADMIN: don gia + gia dau vao + lai gop 29,8%`, /285\.000/.test(vis) && /200\.000/.test(vis) && /29,8%/.test(vis), vis.slice(0, 400));
      await ctx.browser()?.close();

      // ---- Xem gia von: chi doc
      ctx = await ctxFor(engine, "COST_VIEWER");
      p = await ctx.newPage();
      await p.goto(`${BASE}/gia-dau-vao/theo-ma`);
      await p.waitForSelector("table", { timeout: 30000 });
      vis = await p.locator("main").innerText();
      check(`${tg} COST_VIEWER thay gia dau vao, khong co o nhap / nut luu / gia ban`, /200\.000/.test(vis) && (await p.locator('input[name^="p_"]').count()) === 0 && (await p.locator('button:has-text("Lưu giá đầu vào")').count()) === 0 && !vis.toLowerCase().includes(TXT.vi.sell.toLowerCase()));
      await ctx.browser()?.close();

      // ---- VIEWER: khong vao duoc (khong co quyen costs.view)
      ctx = await ctxFor(engine, "VIEWER");
      p = await ctx.newPage();
      await p.goto(`${BASE}/gia-dau-vao/theo-ma`);
      check(`${tg} VIEWER bi chuyen khoi man nay`, !p.url().includes("/gia-dau-vao"), p.url());
      await ctx.browser()?.close();

      // ---- 3 ngon ngu (Quan tri)
      for (const loc of ["zh", "en"] as const) {
        ctx = await ctxFor(engine, "ADMIN", loc);
        p = await ctx.newPage();
        await p.goto(`${BASE}/gia-dau-vao/theo-ma`);
        await p.waitForSelector("table", { timeout: 30000 });
        vis = await p.locator("main").innerText();
        check(`${tg} [${loc}] tab + cot dich du, khong lo khoa dich`, vis.includes(TXT[loc].tab) && vis.toLowerCase().includes(TXT[loc].cost.toLowerCase()) && vis.toLowerCase().includes(TXT[loc].sell.toLowerCase()) && !/byCode\.|costs\./.test(vis), vis.slice(0, 200));
        if (engine === "iphone") check(`${tg} [${loc}] khong tran ngang`, (await noOverflow(p)) === true, await noOverflow(p));
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
    await db.portalAudit.deleteMany({ where: { supplierId: { in: [seed.supplierId] } } });
    try { crmScript("clean", String(seed.supplierId)); } catch { /* da don */ }
    console.log(`\n${passed} dat, ${failed} loi`);
    await db.$disconnect();
    process.exit(failed ? 1 : 0);
  }
}
main();
