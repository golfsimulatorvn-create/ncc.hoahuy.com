/**
 * E2E NCC thu cap mac dinh theo ma hang (specs/068): Nhan vien them nhanh NCC thu cap, chon NCC cho ma (co / chua co gia),
 * loc theo NCC, lich su doi NCC, chon ngay tren dong don mua, Quan tri xoa NCC dang gan (the xac nhan roi go gan),
 * Xem gia von chi doc, Chi xem khong vao duoc, 3 ngon ngu, khong tran ngang tren iPhone 13.
 * Can: cong dev :3200 + CRM dev :3145 (SUPPLIER_PORTAL_HMAC_SECRET = CRM_HMAC_SECRET cua cong, CRM da co specs/068),
 *      repo CRM o ../hoahuy-ERP-app.   Chay: npx tsx scripts/e2e-item-sub-vendors.ts [--engine=desktop|iphone]
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
  vi: { col: "NCC thứ cấp", none: "Chưa chọn NCC" },
  zh: { col: "二级供应商", none: "未选二级供应商" },
  en: { col: "Sub-supplier", none: "No sub-supplier chosen" },
} as const;

async function main() {
  const { db } = await import("../src/server/db");
  const { encryptSecret, hashPassword, hashToken, randomToken } = await import("../src/server/crypto");
  let seed = seedOnce();
  const tag = `sv${Date.now()}`;
  const cred = await db.supplierCredential.create({ data: { crmSupplierId: seed.supplierId, supplierCode: tag, supplierName: `NCC ${tag}`, apiKeyEnc: encryptSecret(seed.apiKey) } });
  const users: Record<string, { id: number; token: string }> = {};
  for (const r of ["ADMIN", "STAFF", "VIEWER", "COST_VIEWER"] as const) {
    const u = await db.supplierUser.create({ data: { credentialId: cred.id, email: `${tag}.${r}@test.vn`, displayName: `User ${r}`, role: r, status: "ACTIVE", passwordHash: await hashPassword("MatKhau-Test-1"), locale: "vi" } });
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
      const alpha = `Alpha ${tag}-${engine}`, beta = `Beta ${tag}-${engine}`;

      // ---- Nhan vien: them nhanh NCC thu cap, chon NCC cho ma
      let ctx = await ctxFor(engine, "STAFF");
      let p = await ctx.newPage();
      await p.goto(`${BASE}/gia-dau-vao/theo-ma`);
      await p.waitForSelector("table", { timeout: 30000 });
      const head = await p.locator("thead").innerText();
      check(`${tg} STAFF: bang co cot "${TXT.vi.col}"`, head.toLowerCase().includes(TXT.vi.col.toLowerCase()), head);
      check(`${tg} STAFF: moi ma co 1 o chon NCC thu cap (4 ma)`, (await p.locator('tbody select[name^="s_"]').count()) === 4);
      if (engine === "iphone") check(`${tg} STAFF khong tran ngang`, (await noOverflow(p)) === true, await noOverflow(p));
      const hSel = (await p.locator('tbody select[name^="s_"]').first().boundingBox())?.height ?? 0;
      check(`${tg} o chon NCC cao >= 44px (${Math.round(hSel)})`, hSel >= 43.5, hSel);

      for (const nm of [alpha, beta]) {
        await p.fill('[data-testid="quick-add-sub"] input[name="name"]', nm);
        await p.click('[data-testid="quick-add-sub"] button[type="submit"]');
        // doi o chon cap nhat (khong dua vao URL vi lan 2 URL van co ok=subVendorAdded tu lan 1)
        await p.waitForFunction((n) => Array.from(document.querySelectorAll('select[name^="s_"] option')).some((o) => (o.textContent ?? "").includes(n)), nm, { timeout: 20000 });
      }
      check(`${tg} them nhanh 2 NCC thu cap -> thong bao da them`, (await p.locator('p[role="status"]').innerText()).includes("Đã thêm nhà cung cấp thứ cấp"));
      const optTexts = await p.locator('tbody tr').first().locator('select[name^="s_"] option').allInnerTexts();
      check(`${tg} o chon co 2 NCC vua them + "Chưa chọn"`, optTexts.some((x) => x.includes(alpha)) && optTexts.some((x) => x.includes(beta)) && optTexts[0].includes("Chưa chọn"), optTexts);

      const subSel = (code: string) => p.locator(`tr:has-text("${code}") select[name^="s_"]`);
      const priceInput = (code: string) => p.locator(`tr:has-text("${code}") input[name^="p_"]`);
      await subSel("VT-A").selectOption({ label: alpha });
      await priceInput("VT-A").fill("200.000");
      await subSel("VT-B").selectOption({ label: beta }); // ma CHUA co gia van chon duoc NCC
      await Promise.all([p.waitForURL(/ok=costSaved/, { timeout: 20000 }), p.click('button:has-text("Lưu giá đầu vào")')]);
      await p.waitForSelector("table");
      check(`${tg} VT-A hien NCC ${alpha} + gia 200000 sau khi luu`, (await subSel("VT-A").locator("option:checked").innerText()).includes(alpha) && (await priceInput("VT-A").inputValue()) === "200000");
      check(`${tg} VT-B (chua co gia) van luu duoc NCC ${beta}, gia van trong`, (await subSel("VT-B").locator("option:checked").innerText()).includes(beta) && (await priceInput("VT-B").inputValue()) === "");

      await p.goto(`${BASE}/gia-dau-vao/theo-ma?missing=1`);
      let vis = await p.locator("main").innerText();
      check(`${tg} loc 'chua co gia': VT-B (da co NCC) con, VT-A mat`, vis.includes("VT-B") && !vis.includes("VT-A"));

      // loc theo NCC thu cap
      await p.goto(`${BASE}/gia-dau-vao/theo-ma`);
      const alphaId = await p.locator('select[name="ncc"] option', { hasText: alpha }).getAttribute("value");
      await p.selectOption('select[name="ncc"]', alphaId!);
      await Promise.all([p.waitForURL(new RegExp(`ncc=${alphaId}`)), p.click('button:has-text("Lọc")')]);
      vis = await p.locator("tbody").innerText();
      check(`${tg} loc NCC ${alpha}: chi VT-A`, vis.includes("VT-A") && !vis.includes("VT-B") && !vis.includes("VT-1"));
      await p.goto(`${BASE}/gia-dau-vao/theo-ma?ncc=none`);
      vis = await p.locator("tbody").innerText();
      check(`${tg} loc 'Chưa chọn NCC': VT-1, VT-2 (khong con VT-A, VT-B)`, vis.includes("VT-1") && vis.includes("VT-2") && !vis.includes("VT-A") && !vis.includes("VT-B"));

      // doi NCC + lich su
      await p.goto(`${BASE}/gia-dau-vao/theo-ma`);
      await subSel("VT-A").selectOption({ label: beta });
      await Promise.all([p.waitForURL(/ok=costSaved/, { timeout: 20000 }), p.click('button:has-text("Lưu giá đầu vào")')]);
      await p.click('tr:has-text("VT-A") >> text=Lịch sử');
      await p.waitForURL(/hist=VT-A/);
      const sh = await p.locator('[data-testid="sub-history"]').innerText();
      check(`${tg} lich su doi NCC cua VT-A: (chua chon) -> ${alpha} -> ${beta}`, sh.includes(alpha) && sh.includes(beta) && sh.includes("Chưa chọn"), sh);

      // chon ngay tren dong don mua
      await p.goto(`${BASE}/don-mua/${seed.sentId}`);
      vis = await p.locator("main").innerText();
      check(`${tg} don mua: co cot NCC thu cap, dong VT-A hien ${beta}`, vis.toLowerCase().includes(TXT.vi.col.toLowerCase()) && (await p.locator('select[name="s_0"] option:checked').innerText()).includes(beta));
      await p.selectOption('select[name="s_0"]', { label: alpha });
      await Promise.all([p.waitForURL(/ok=costSaved/, { timeout: 20000 }), p.click('button[form="costform"]')]);
      check(`${tg} don mua: doi NCC tren dong luu duoc (ap dung cho ma)`, (await p.locator('select[name="s_0"] option:checked').innerText()).includes(alpha));
      if (engine === "iphone") check(`${tg} don mua khong tran ngang`, (await noOverflow(p)) === true, await noOverflow(p));
      await ctx.browser()?.close();

      // ---- Xem gia von: chi doc, thay ten NCC
      ctx = await ctxFor(engine, "COST_VIEWER");
      p = await ctx.newPage();
      await p.goto(`${BASE}/gia-dau-vao/theo-ma`);
      await p.waitForSelector("table", { timeout: 30000 });
      vis = await p.locator("tbody").innerText();
      check(`${tg} COST_VIEWER: thay ten NCC thu cap, khong co o chon`, vis.includes(alpha) && vis.includes(beta) && (await p.locator('select[name^="s_"]').count()) === 0 && (await p.locator('[data-testid="quick-add-sub"]').count()) === 0);
      await ctx.browser()?.close();

      // ---- VIEWER: khong vao duoc
      ctx = await ctxFor(engine, "VIEWER");
      p = await ctx.newPage();
      await p.goto(`${BASE}/gia-dau-vao/theo-ma`);
      check(`${tg} VIEWER bi chuyen khoi man nay`, !p.url().includes("/gia-dau-vao"), p.url());
      await ctx.browser()?.close();

      // ---- Quan tri: xoa NCC dang gan -> the xac nhan -> go gan
      ctx = await ctxFor(engine, "ADMIN");
      p = await ctx.newPage();
      await p.goto(`${BASE}/gia-dau-vao/theo-ma`);
      const aId = await p.locator('select[name="ncc"] option', { hasText: alpha }).getAttribute("value");
      await p.goto(`${BASE}/gia-dau-vao/${aId}`);
      await Promise.all([p.waitForURL(/confirm=unassign/, { timeout: 20000 }), p.click('button:has-text("Xóa nhà cung cấp")')]);
      const cf = await p.locator('[data-testid="unassign-confirm"]').innerText();
      check(`${tg} xoa NCC dang gan: the xac nhan nhac so ma + ma VT-A, khong xoa ngay`, /1 mã hàng/.test(cf) && cf.includes("VT-A"), cf);
      if (engine === "iphone") check(`${tg} the xac nhan khong tran ngang`, (await noOverflow(p)) === true, await noOverflow(p));
      await Promise.all([p.waitForURL(/ok=archivedUnassigned/, { timeout: 20000 }), p.click('[data-testid="unassign-go"]')]);
      await p.goto(`${BASE}/gia-dau-vao/theo-ma`);
      await p.waitForSelector("table");
      const opts = await p.locator('tbody tr').first().locator('select[name^="s_"] option').allInnerTexts();
      check(`${tg} sau khi xoa: ${alpha} het trong danh sach, VT-A ve "Chưa chọn"`, !opts.some((x) => x.includes(alpha)) && (await subSel("VT-A").locator("option:checked").innerText()).includes("Chưa chọn"));
      await ctx.browser()?.close();

      // ---- 3 ngon ngu (Quan tri)
      for (const loc of ["zh", "en"] as const) {
        ctx = await ctxFor(engine, "ADMIN", loc);
        p = await ctx.newPage();
        await p.goto(`${BASE}/gia-dau-vao/theo-ma`);
        await p.waitForSelector("table", { timeout: 30000 });
        vis = await p.locator("main").innerText();
        // Chu trong <option> khong nam trong innerText cua main tren WebKit: doc rieng cac option cua bo loc NCC.
        const filterOpts = (await p.locator('select[name="ncc"] option').allInnerTexts()).join(" | ").toLowerCase();
        check(`${tg} [${loc}] cot + bo loc dich du, khong lo khoa dich`, vis.toLowerCase().includes(TXT[loc].col.toLowerCase()) && filterOpts.includes(TXT[loc].none.toLowerCase()) && !/byCode\.|costs\./.test(vis + filterOpts), { vis: vis.slice(0, 120), filterOpts });
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
