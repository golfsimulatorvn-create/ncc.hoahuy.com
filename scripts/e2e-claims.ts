/**
 * E2E Khieu nai + Chung tu Cong NCC (specs/054 T095): Quan tri / Nhan vien phan hoi khieu nai + tai chung tu len don mua va khieu nai,
 * tai lai, go; tep sai duoi / sai noi dung bi chan; Chi xem chi doc; khieu nai chua chia se va ghi chu noi bo KHONG lo; IDOR tep.
 * Can: cong dev :3200 + CRM dev (xem e2e-orders.ts). Chay: npx tsx scripts/e2e-claims.ts [--engine=desktop|iphone]
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
const jsonOf = (out: string) => JSON.parse(out.split("\n").find((l) => l.startsWith("JSON:"))!.slice(5));

async function act(p: Page, click: () => Promise<unknown>, re: RegExp, sel: string) {
  await Promise.all([p.waitForURL(re, { timeout: 25000 }), click()]);
  await p.waitForSelector(sel, { timeout: 15000 });
}

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const FAKE = Buffer.from("MZ\x90\x00 day khong phai pdf"); // doi duoi .exe -> .pdf
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: PDF });

async function main() {
  const { db } = await import("../src/server/db");
  const { encryptSecret, hashPassword, hashToken, randomToken } = await import("../src/server/crypto");
  const seed = jsonOf(crmScript("seed")) as { supplierId: number; apiKey: string; sentId: number };
  const claim = jsonOf(crmScript("seed-claim", String(seed.supplierId))) as { claimId: number; hiddenClaimId: number };
  const tag = `ek${Date.now()}`;
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
  const upForm = 'form:has(button:text-is("Tải lên"))';

  try {
    for (const engine of (["desktop", "iphone"] as const).filter((e) => ENGINE === "all" || e === ENGINE)) {
      const tg = `[${engine}]`;
      let ctx = await ctxFor(engine, "ADMIN");
      let p = await ctx.newPage();

      // Danh sach khieu nai
      await p.goto(`${BASE}/khieu-nai`);
      let main = await p.locator("main").innerText();
      let html = await p.content();
      check(`${tg} danh sach thay khieu nai da chia se #${claim.claimId}`, main.includes(`#${claim.claimId}`) && main.includes("Đổi hàng mới"), main.slice(0, 200));
      check(`${tg} KHONG thay khieu nai chua chia se va ghi chu noi bo`, !main.includes(`#${claim.hiddenClaimId}`) && !/GHI CHU NOI BO|CHUA CHIA SE/.test(html));
      if (engine === "iphone") { const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); check(`${tg} danh sach khieu nai khong tran ngang`, m.sw <= m.iw + 1, m); }

      // Chi tiet + phan hoi
      await p.goto(`${BASE}/khieu-nai/${claim.claimId}`);
      await p.fill('textarea[name="note"]', "Se doi hang moi trong 7 ngay");
      await act(p, () => p.click('button:text-is("Gửi phản hồi")'), /ok=responded/, STATUS);
      main = await p.locator("main").innerText();
      check(`${tg} gui phan hoi -> hien noi dung + nguoi gui`, main.includes("Se doi hang moi") && main.includes("User ADMIN"));
      // Khieu nai chua chia se -> 404
      const hid = await p.goto(`${BASE}/khieu-nai/${claim.hiddenClaimId}`);
      check(`${tg} mo khieu nai chua chia se -> 404`, hid?.status() === 404, hid?.status());

      // Tai chung tu len khieu nai
      await p.goto(`${BASE}/khieu-nai/${claim.claimId}`);
      await p.setInputFiles(`${upForm} input[type="file"]`, pdf("phan-hoi.pdf"));
      await p.selectOption(`${upForm} select[name="docType"]`, "PHAN_HOI");
      await act(p, () => p.click(`${upForm} button[type="submit"]`), /dok=uploaded/, STATUS);
      check(`${tg} tai chung tu len khieu nai -> co trong danh sach`, (await p.locator('a:text-is("phan-hoi.pdf")').count()) === 1);
      // Tep sai noi dung
      await p.setInputFiles(`${upForm} input[type="file"]`, { name: "gia.pdf", mimeType: "application/pdf", buffer: FAKE });
      await act(p, () => p.click(`${upForm} button[type="submit"]`), /derr=up_magic/, ALERT);
      check(`${tg} tep doi duoi (khong khop noi dung) -> bi chan`, (await p.locator(ALERT).innerText()).includes("không khớp"));
      // Tep sai duoi
      await p.setInputFiles(`${upForm} input[type="file"]`, { name: "ma-doc.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });
      await act(p, () => p.click(`${upForm} button[type="submit"]`), /derr=up_ext/, ALERT);
      check(`${tg} tep .exe -> bi chan dinh dang`, (await p.locator(ALERT).innerText()).includes("không đúng định dạng"));

      // Tai ve + IDOR
      const href = await p.locator('a:text-is("phan-hoi.pdf")').first().getAttribute("href");
      const dl = await ctx.request.get(`${BASE}${href}`);
      const body = await dl.body();
      check(`${tg} tai lai chung tu dung noi dung + tai xuong`, dl.status() === 200 && body.subarray(0, 4).toString() === "%PDF" && (dl.headers()["content-disposition"] ?? "").includes("attachment"), dl.status());
      const idor = await ctx.request.get(`${BASE}/tep/chung-tu/99999999`);
      check(`${tg} tep khong thuoc NCC -> 404`, idor.status() === 404, idor.status());
      const anon = await (await chromium.launch()).newContext();
      const noAuth = await anon.request.get(`${BASE}${href}`, { maxRedirects: 0 });
      check(`${tg} chua dang nhap tai tep -> 401`, noAuth.status() === 401, noAuth.status());
      await anon.browser()?.close();

      // Chung tu cua don mua
      await p.goto(`${BASE}/don-mua/${seed.sentId}`);
      await p.setInputFiles(`${upForm} input[type="file"]`, pdf("hoa-don-1.pdf"));
      await p.selectOption(`${upForm} select[name="docType"]`, "HOA_DON");
      await act(p, () => p.click(`${upForm} button[type="submit"]`), /dok=uploaded/, STATUS);
      check(`${tg} tai hoa don len don mua -> hien chip Hoa don`, (await p.locator('a:text-is("hoa-don-1.pdf")').count()) === 1 && (await p.locator(".chip", { hasText: "Hóa đơn" }).count()) === 1);
      // Man Chung tu
      await p.goto(`${BASE}/chung-tu?don=${seed.sentId}`);
      check(`${tg} man Chung tu thay chung tu cua don`, (await p.locator('a:text-is("hoa-don-1.pdf")').count()) === 1);
      if (engine === "iphone") { const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); check(`${tg} man Chung tu khong tran ngang`, m.sw <= m.iw + 1, m); }
      // Go
      await act(p, () => p.click('button:text-is("Gỡ")'), /dok=deleted/, STATUS);
      check(`${tg} go chung tu -> khong con trong danh sach`, (await p.locator('a:text-is("hoa-don-1.pdf")').count()) === 0);
      await ctx.browser()?.close();

      // Nhan vien: phan hoi + tai len duoc
      ctx = await ctxFor(engine, "STAFF");
      p = await ctx.newPage();
      await p.goto(`${BASE}/khieu-nai/${claim.claimId}`);
      check(`${tg} STAFF thay form phan hoi + tai len`, (await p.locator('button:text-is("Cập nhật phản hồi")').count()) === 1 && (await p.locator(upForm).count()) === 1);
      await ctx.browser()?.close();

      // Chi xem: doc duoc, khong co form
      ctx = await ctxFor(engine, "VIEWER");
      p = await ctx.newPage();
      await p.goto(`${BASE}/khieu-nai/${claim.claimId}`);
      main = await p.locator("main").innerText();
      check(`${tg} VIEWER doc duoc phan hoi nhung khong co form gui / tai len / go`, main.includes("Se doi hang moi") && (await p.locator("textarea").count()) === 0 && (await p.locator('input[type="file"]').count()) === 0 && (await p.locator('button:text-is("Gỡ")').count()) === 0);
      await ctx.browser()?.close();

      // Xem gia dau vao: khong vao duoc khieu nai / chung tu
      ctx = await ctxFor(engine, "COST_VIEWER");
      p = await ctx.newPage();
      await p.goto(`${BASE}/khieu-nai`);
      check(`${tg} COST_VIEWER khong vao duoc Khieu nai`, !/\/khieu-nai/.test(p.url()), p.url());
      await p.goto(`${BASE}/chung-tu`);
      check(`${tg} COST_VIEWER khong vao duoc Chung tu`, !/\/chung-tu/.test(p.url()), p.url());
      const blocked = await ctx.request.get(`${BASE}/tep/chung-tu/1`);
      check(`${tg} COST_VIEWER tai tep -> 403`, blocked.status() === 403, blocked.status());
      await ctx.browser()?.close();
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
