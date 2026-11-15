/**
 * E2E dang nhap Cong NCC (specs/054 T047): 3 ngon ngu x may tinh + iPhone 13 (WebKit).
 * Luong: sai mat khau -> dung mat khau + thiet bi moi hoi OTP -> nho thiet bi -> dang nhap lai khong hoi ma -> thiet bi khac hoi ma
 * -> kich hoat tai khoan moi (moi -> dat mat khau -> OTP) -> quen/dat lai mat khau -> khoa tam -> khong tran ngang tren dien thoai.
 * Can server dev chay o http://localhost:3200 (npm run dev), CSDL .env, SMTP trong (mail ghi ra .dev-outbox.jsonl).
 * Chay: npx tsx scripts/e2e-auth.ts [--engine=desktop|iphone]   (WEBKIT_PATH=<Playwright.exe> neu can)
 */
try { process.loadEnvFile(".env"); } catch { /* da co bien */ }
import fs from "node:fs";
import { chromium, devices, webkit, type Browser, type Page } from "@playwright/test";

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3200";
const ENGINE = process.argv.find((a) => a.startsWith("--engine="))?.slice(9) ?? "all";
const OUTBOX = ".dev-outbox.jsonl";
const LOCALES = ["vi", "zh", "en"] as const;
type Loc = (typeof LOCALES)[number];
let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`OK    ${name}`); } else { failed++; console.log(`FAIL  ${name}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`); }
}
const msg = (l: Loc, ns: string) => JSON.parse(fs.readFileSync(`messages/${l}/${ns}.json`, "utf8"));

type Mail = { to: string; kind: string; vars: Record<string, string>; at: number };
const mails = (): Mail[] => (fs.existsSync(OUTBOX) ? fs.readFileSync(OUTBOX, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
async function waitMail(to: string, kind: string, since: number): Promise<Mail> {
  for (let i = 0; i < 40; i++) {
    const m = [...mails()].reverse().find((x) => x.to === to && x.kind === kind && x.at >= since);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`khong thay mail ${kind} cho ${to}`);
}

async function main() {
  const { db } = await import("../src/server/db");
  const { encryptSecret, hashPassword } = await import("../src/server/crypto");
  const { inviteUser } = await import("../src/server/userAdmin");
  const tag = `e2e${Date.now()}`;
  const PW = "MatKhauE2E12345";
  const cred = await db.supplierCredential.create({ data: { crmSupplierId: 9_100_001, supplierCode: tag, supplierName: `NCC ${tag}`, apiKeyEnc: encryptSecret("k".repeat(32)) } });
  const admin = await db.supplierUser.create({ data: { credentialId: cred.id, email: `${tag}.admin@test.vn`, displayName: "Admin E2E", role: "ADMIN", status: "ACTIVE", passwordHash: await hashPassword(PW) } });
  const actor = { label: "e2e", supplierId: 9_100_001, role: "E2E" };

  const launch = async (engine: "desktop" | "iphone"): Promise<Browser> =>
    engine === "desktop" ? chromium.launch() : webkit.launch(process.env.WEBKIT_PATH ? { executablePath: process.env.WEBKIT_PATH } : {});
  const newPage = async (b: Browser, engine: string, locale: Loc): Promise<Page> => {
    const ctx = await b.newContext(engine === "iphone" ? { ...devices["iPhone 13"] } : { viewport: { width: 1366, height: 900 } });
    await ctx.addCookies([{ name: "HH_LOCALE", value: locale, url: BASE }]);
    return ctx.newPage();
  };
  const alertHas = async (p: Page, text: string) => p.locator('p[role="alert"]', { hasText: text }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  const noOverflow = async (p: Page) => { const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); return m.sw <= m.iw + 1 ? true : m; };
  const noKeys = async (p: Page) => { const t = await p.locator("body").innerText(); return !/\b(auth|common|users|nav)\.[a-z]+\.?[a-zA-Z]*/.test(t) && !t.includes("MISSING_MESSAGE"); };

  try {
    for (const engine of (["desktop", "iphone"] as const).filter((e) => ENGINE === "all" || e === ENGINE)) {
      const browser = await launch(engine);
      try {
        for (const locale of LOCALES) {
          const A = msg(locale, "auth"), U = msg(locale, "users");
          await db.supplierUser.update({ where: { id: admin.id }, data: { locale, failedLoginCount: 0, lockedUntil: null } });
          await db.loginAttempt.deleteMany({ where: { email: admin.email } });
          const tg = `[${engine} ${locale}]`;
          const page = await newPage(browser, engine, locale);

          // a. Trang dang nhap + sai mat khau
          await page.goto(`${BASE}/dang-nhap`);
          let text = await page.locator("body").innerText();
          check(`${tg} dang nhap hien tieu de "${A.login.title}"`, text.includes(A.login.title), text.slice(0, 200));
          check(`${tg} khong lo khoa dich o dang nhap`, await noKeys(page));
          if (engine === "iphone") check(`${tg} dang nhap khong tran ngang`, (await noOverflow(page)) === true, await noOverflow(page));
          await page.fill('input[name="email"]', admin.email);
          await page.fill('input[name="password"]', "SaiMatKhau12345");
          await page.click('form:has(input[name="password"]) button[type="submit"]');
          await page.waitForSelector('p[role="alert"]');
          check(`${tg} sai mat khau -> thong bao dung ngon ngu`, (await page.locator('p[role="alert"]').innerText()).includes(A.login.bad));

          // b. Dung mat khau, thiet bi moi -> OTP
          const t0 = Date.now() - 1000;
          await page.fill('input[name="password"]', PW);
          await page.click('form:has(input[name="password"]) button[type="submit"]');
          await page.waitForURL("**/dang-nhap/ma");
          text = await page.locator("body").innerText();
          check(`${tg} thiet bi moi -> trang nhap ma`, text.includes(A.otp.titleNewDevice) && text.includes(admin.email), text.slice(0, 200));
          check(`${tg} trang ma khong lo khoa dich`, await noKeys(page));
          if (engine === "iphone") check(`${tg} trang ma khong tran ngang`, (await noOverflow(page)) === true);
          const otp = (await waitMail(admin.email, "otp", t0)).vars.code;
          await page.fill('input[name="code"]', otp === "000000" ? "111111" : "000000");
          await page.click('form:has(input[name="code"]) button[type="submit"]');
          await page.waitForSelector('p[role="alert"]');
          check(`${tg} ma sai -> bao loi`, (await page.locator('p[role="alert"]').innerText()).includes(A.otp.bad));
          await page.fill('input[name="code"]', otp);
          await page.click('form:has(input[name="code"]) button[type="submit"]');
          await page.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 30000 });
          check(`${tg} ma dung -> vao cong (${new URL(page.url()).pathname})`, new URL(page.url()).pathname === "/don-mua");
          const nd = (await waitMail(admin.email, "newDevice", t0));
          check(`${tg} co email bao thiet bi moi`, !!nd);

          // c. Trang Nguoi dung
          await page.goto(`${BASE}/nguoi-dung`);
          text = await page.locator("body").innerText();
          check(`${tg} man Nguoi dung (${U.title})`, text.includes(U.title) && text.includes(admin.email) && text.includes(msg(locale, "common").role.ADMIN), text.slice(0, 200));
          check(`${tg} man Nguoi dung khong lo khoa dich`, await noKeys(page));
          if (engine === "iphone") check(`${tg} man Nguoi dung khong tran ngang trang`, (await noOverflow(page)) === true, await noOverflow(page));

          // d. Dang xuat roi dang nhap lai CUNG thiet bi: khong hoi OTP
          await page.click(`button:has-text("${msg(locale, "common").logout}")`);
          await page.waitForURL("**/dang-nhap");
          await page.fill('input[name="email"]', admin.email);
          await page.fill('input[name="password"]', PW);
          await page.click('form:has(input[name="password"]) button[type="submit"]');
          await page.waitForURL((u) => !u.pathname.startsWith("/dang-nhap"), { timeout: 30000 });
          check(`${tg} thiet bi da nho -> dang nhap khong hoi ma`, new URL(page.url()).pathname === "/don-mua");
          await page.context().close();

          // e. Thiet bi KHAC (context moi) -> lai hoi ma
          if (locale === "vi") {
            const p2 = await newPage(browser, engine, locale);
            await p2.goto(`${BASE}/dang-nhap`);
            await p2.fill('input[name="email"]', admin.email);
            await p2.fill('input[name="password"]', PW);
            await p2.click('form:has(input[name="password"]) button[type="submit"]');
            await p2.waitForURL("**/dang-nhap/ma");
            check(`${tg} thiet bi khac -> hoi ma`, true);
            // truy cap man trong khi chua xong OTP phai bi chan
            await p2.goto(`${BASE}/nguoi-dung`);
            check(`${tg} chua nhap ma thi khong vao duoc man trong cong`, new URL(p2.url()).pathname === "/dang-nhap");
            await p2.context().close();
          }
        }

        // f. Kich hoat tai khoan moi (chi vi, 1 lan/engine)
        const tgv = `[${engine} vi]`;
        const A = msg("vi", "auth");
        const t1 = Date.now() - 1000;
        const staff = await inviteUser(cred.id, { email: `${tag}.${engine}.staff@test.vn`, name: "Nhan vien E2E", role: "STAFF", locale: "vi" }, actor);
        const inv = await waitMail(staff.email, "invite", t1);
        const p3 = await newPage(browser, engine, "vi");
        await p3.goto(inv.vars.link);
        check(`${tgv} trang kich hoat hien ten + email`, (await p3.locator("body").innerText()).includes(staff.email));
        await p3.fill('input[name="password"]', "ngan1");
        await p3.fill('input[name="confirm"]', "ngan1");
        await p3.evaluate(() => document.querySelectorAll("input[minlength]").forEach((i) => i.removeAttribute("minlength")));
        await p3.click('form:has(input[name="confirm"]) button[type="submit"]');
        await p3.waitForSelector('p[role="alert"]');
        check(`${tgv} mat khau ngan -> bao loi`, (await p3.locator('p[role="alert"]').innerText()).includes(A.invite.short));
        await p3.fill('input[name="password"]', "MatKhauStaff123");
        await p3.fill('input[name="confirm"]', "MatKhauStaff999");
        await p3.click('form:has(input[name="confirm"]) button[type="submit"]');
        check(`${tgv} hai mat khau khac nhau -> bao loi`, await alertHas(p3, A.invite.mismatch));
        await p3.fill('input[name="password"]', "MatKhauStaff123");
        await p3.fill('input[name="confirm"]', "MatKhauStaff123");
        const t2 = Date.now() - 1000;
        await p3.click('form:has(input[name="confirm"]) button[type="submit"]');
        await p3.waitForURL("**/dang-nhap/ma");
        await p3.fill('input[name="code"]', (await waitMail(staff.email, "otp", t2)).vars.code);
        await p3.click('form:has(input[name="code"]) button[type="submit"]');
        await p3.waitForURL((u) => !u.pathname.startsWith("/dang-nhap") && !u.pathname.startsWith("/moi"), { timeout: 30000 });
        check(`${tgv} kich hoat xong -> vao cong voi vai tro Nhan vien`, new URL(p3.url()).pathname === "/don-mua" && (await db.supplierUser.findUniqueOrThrow({ where: { id: staff.id } })).status === "ACTIVE");
        await p3.goto(`${BASE}/nguoi-dung`);
        check(`${tgv} Nhan vien vao /nguoi-dung bi chuyen di`, new URL(p3.url()).pathname === "/don-mua", p3.url());
        await p3.goto(inv.vars.link);
        check(`${tgv} link moi da dung -> bao khong hop le`, (await p3.locator("body").innerText()).includes(A.invite.invalid));
        await p3.context().close();

        // g. Quen mat khau + dat lai
        const p4 = await newPage(browser, engine, "vi");
        const t3 = Date.now() - 1000;
        await p4.goto(`${BASE}/quen-mat-khau`);
        await p4.fill('input[name="email"]', staff.email);
        await p4.click('form:has(input[name="email"]) button[type="submit"]');
        await p4.waitForSelector('p[role="status"]');
        check(`${tgv} quen mat khau -> thong bao chung`, (await p4.locator('p[role="status"]').innerText()).includes(A.forgot.sent));
        const rst = await waitMail(staff.email, "reset", t3);
        await p4.goto(rst.vars.link);
        await p4.fill('input[name="password"]', "MatKhauMoi12345");
        await p4.fill('input[name="confirm"]', "MatKhauMoi12345");
        const t4 = Date.now() - 1000;
        await p4.click('form:has(input[name="confirm"]) button[type="submit"]');
        await p4.waitForURL("**/dang-nhap/ma");
        await p4.fill('input[name="code"]', (await waitMail(staff.email, "otp", t4)).vars.code);
        await p4.click('form:has(input[name="code"]) button[type="submit"]');
        await p4.waitForURL((u) => !u.pathname.startsWith("/dang-nhap") && !u.pathname.startsWith("/dat-lai"), { timeout: 30000 });
        check(`${tgv} dat lai mat khau xong -> vao cong`, new URL(p4.url()).pathname === "/don-mua");
        check(`${tgv} dat lai mat khau thu hoi phien/thiet bi cu`, (await db.session.count({ where: { userId: staff.id, revokedAt: { not: null } } })) >= 1);
        await p4.context().close();
        const pOld = await newPage(browser, engine, "vi");
        await pOld.goto(`${BASE}/dang-nhap`);
        await pOld.fill('input[name="email"]', staff.email);
        await pOld.fill('input[name="password"]', "MatKhauStaff123");
        await pOld.click('form:has(input[name="password"]) button[type="submit"]');
        await pOld.waitForSelector('p[role="alert"]');
        check(`${tgv} mat khau cu khong con dung`, (await pOld.locator('p[role="alert"]').innerText()).includes(A.login.bad));

        // h. Khoa tam sau nhieu lan sai
        await db.loginAttempt.deleteMany({ where: { email: staff.email } });
        for (let i = 0; i < 5; i++) {
          await pOld.fill('input[name="password"]', "SaiMatKhau1234" + i);
          await pOld.click('form:has(input[name="password"]) button[type="submit"]');
          await pOld.waitForTimeout(400);
        }
        await pOld.fill('input[name="password"]', "MatKhauMoi12345");
        await pOld.click('form:has(input[name="password"]) button[type="submit"]');
        check(`${tgv} sai nhieu lan -> khoa tam, ke ca khi nhap dung`, await alertHas(pOld, "15 phút"));
        await pOld.context().close();
      } finally {
        await browser.close();
      }
    }
  } catch (e) {
    failed++;
    console.log("FAIL  ngoai le:", e instanceof Error ? e.stack : e);
  } finally {
    const users = await db.supplierUser.findMany({ where: { credentialId: cred.id }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.deviceToken.deleteMany({ where: { userId: { in: ids } } });
    await db.otpCode.deleteMany({ where: { userId: { in: ids } } });
    await db.invite.deleteMany({ where: { userId: { in: ids } } });
    await db.supplierUser.deleteMany({ where: { credentialId: cred.id } });
    await db.supplierCredential.delete({ where: { id: cred.id } }).catch(() => {});
    await db.loginAttempt.deleteMany({ where: { email: { contains: tag } } });
    await db.portalAudit.deleteMany({ where: { supplierId: 9_100_001 } });
    console.log(`\n${passed} dat, ${failed} loi`);
    await db.$disconnect();
    process.exit(failed ? 1 : 0);
  }
}
main();
