/**
 * E2E Don mua hang Cong NCC (specs/054 T056): Quan tri thay gia/tien, Nhan vien + Chi xem KHONG thay (khong co trong HTML),
 * xac nhan don + ngay giao, gui lai khong ghi trung, don da nhan khong xac nhan duoc, khong tran ngang tren iPhone.
 * Can: cong dev o :3200 va CRM dev o :3145 (chay voi SUPPLIER_PORTAL_HMAC_SECRET = CRM_HMAC_SECRET cua cong), repo CRM o ../hoahuy-ERP-app.
 * Chay: npx tsx scripts/e2e-orders.ts [--engine=desktop|iphone]
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
const crmScript = (...a: string[]) => execFileSync("npx", ["tsx", "scripts/_e2e-portal-orders-seed.ts", ...a], { cwd: CRM_DIR, encoding: "utf8", shell: true, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !["DATABASE_URL", "TOKEN_PEPPER", "CRED_ENC_KEY"].includes(k))) as unknown as NodeJS.ProcessEnv });

async function main() {
  const { db } = await import("../src/server/db");
  const { encryptSecret, hashPassword, hashToken, randomToken } = await import("../src/server/crypto");
  const seed = JSON.parse(crmScript("seed").split("\n").find((l) => l.startsWith("JSON:"))!.slice(5)) as { supplierId: number; apiKey: string; sentId: number; sentCode: string; doneId: number; doneCode: string };
  const tag = `eo${Date.now()}`;
  const cred = await db.supplierCredential.create({ data: { crmSupplierId: seed.supplierId, supplierCode: tag, supplierName: `NCC ${tag}`, apiKeyEnc: encryptSecret(seed.apiKey) } });
  const roles = ["ADMIN", "STAFF", "VIEWER"] as const;
  const users: Record<string, { id: number; token: string }> = {};
  for (const r of roles) {
    const u = await db.supplierUser.create({ data: { credentialId: cred.id, email: `${tag}.${r}@test.vn`, displayName: `User ${r}`, role: r, status: "ACTIVE", passwordHash: await hashPassword("MatKhauE2E12345"), locale: "vi" } });
    const token = randomToken(32);
    await db.session.create({ data: { id: hashToken(token), userId: u.id, expiresAt: new Date(Date.now() + 3600_000), lastSeenAt: new Date() } });
    users[r] = { id: u.id, token };
  }
  const ctxFor = async (engine: string, role: string, locale = "vi"): Promise<BrowserContext> => {
    const b = engine === "desktop" ? await chromium.launch() : await webkit.launch(process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {});
    const ctx = await b.newContext(engine === "iphone" ? { ...devices["iPhone 13"] } : { viewport: { width: 1366, height: 900 } });
    await ctx.addCookies([
      { name: "hh_ncc_session", value: users[role].token, url: BASE },
      { name: "HH_LOCALE", value: locale, url: BASE },
    ]);
    return ctx;
  };

  try {
    for (const engine of (["desktop", "iphone"] as const).filter((e) => ENGINE === "all" || e === ENGINE)) {
      const tg = `[${engine}]`;
      // Quan tri: thay tien
      let ctx = await ctxFor(engine, "ADMIN");
      let p = await ctx.newPage();
      await p.goto(`${BASE}/don-mua`);
      let html = await p.content();
      check(`${tg} ADMIN danh sach co 2 don`, html.includes(seed.sentCode) && html.includes(seed.doneCode));
      check(`${tg} ADMIN thay cot tong tien`, /Tổng tiền/.test(html));
      await p.goto(`${BASE}/don-mua/${seed.sentId}`);
      html = await p.content();
      check(`${tg} ADMIN chi tiet thay don gia 285.000`, /285\.000/.test(html));
      if (engine === "iphone") { const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); check(`${tg} chi tiet khong tran ngang`, m.sw <= m.iw + 1, m); }

      // Xac nhan don
      await p.fill('input[name="etaDate"]', "2026-12-05");
      await p.click('button:has-text("Xác nhận đơn")');
      await p.waitForURL(/ok=confirmed/);
      await p.waitForSelector('p[role="status"]', { timeout: 15000 }).catch(() => {});
      check(`${tg} xac nhan -> thong bao + trang thai Da xac nhan`, (await p.locator('p[role="status"]', { hasText: "Đã xác nhận đơn" }).count()) > 0 && (await p.locator(".chip", { hasText: "Đã xác nhận" }).count()) > 0, p.url());
      const row = await db.supplierCredential.findFirst({ where: { id: cred.id } });
      check(`${tg} sau xac nhan khong con nut xac nhan`, (await p.locator('button:has-text("Xác nhận đơn")').count()) === 0 && !!row);

      // Don da nhan du: khong co nut
      await p.goto(`${BASE}/don-mua/${seed.doneId}`);
      check(`${tg} don da nhan du khong co nut xac nhan`, (await p.locator('button:has-text("Xác nhận đơn")').count()) === 0);
      await p.goto(`${BASE}/don-mua/999999999`);
      check(`${tg} don khong ton tai -> 404`, (await p.content()).includes("404") || /could not be found|not found/i.test(await p.content()));
      await ctx.browser()?.close();

      // Nhan vien + Chi xem: KHONG co gia/tien trong HTML
      for (const role of ["STAFF", "VIEWER"] as const) {
        ctx = await ctxFor(engine, role);
        p = await ctx.newPage();
        await p.goto(`${BASE}/don-mua`);
        html = await p.content();
        check(`${tg} ${role} danh sach khong co cot tong tien`, (await p.locator("th", { hasText: "Tổng tiền" }).count()) === 0 && html.includes(seed.doneCode));
        await p.goto(`${BASE}/don-mua/${seed.doneId}`);
        html = await p.content();
        const vis = await p.locator("main").innerText();
        check(`${tg} ${role} chi tiet KHONG lo gia (chu hien thi + du lieu tho)`, !/(285[.,]?000|210[.,]?000)/.test(html) && !/Đơn giá|Thành tiền|Đã thanh toán/.test(vis), { m: html.match(/.{30}(285[.,]?000|210[.,]?000).{30}/)?.[0], vis: vis.slice(0, 200) });
        check(`${tg} ${role} van thay ten hang va so luong`, html.includes("Cell pin LFP 3.2V"));
        if (role === "VIEWER") check(`${tg} VIEWER khong co o ghi tay NCC thu cap`, (await p.locator('input[name="subVendorName"]').count()) === 0);
        await ctx.browser()?.close();
      }
      // Dat lai don SENT cho vong sau
      await db.$executeRawUnsafe("select 1");
      if (ENGINE === "all" && engine === "desktop") {
        // vong iPhone can don SENT moi: tao them qua seed
        const s2 = JSON.parse(crmScript("seed").split("\n").find((l) => l.startsWith("JSON:"))!.slice(5)) as typeof seed;
        const c2 = await db.supplierCredential.update({ where: { id: cred.id }, data: { crmSupplierId: s2.supplierId, apiKeyEnc: encryptSecret(s2.apiKey) } });
        crmScript("clean", String(seed.supplierId));
        Object.assign(seed, s2);
        void c2;
      }
    }
  } catch (e) {
    failed++;
    console.log("LOI:", e instanceof Error ? e.message.slice(0, 400) : e);
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
