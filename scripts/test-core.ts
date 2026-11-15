/**
 * Kiem thu loi cong NCC (T-core): ma hoa khoa, chu ky, kich hoat -> OTP -> dang nhap, khoa tam, quan tri cuoi cung,
 * huy phien khi doi vai tro/khoa, tam ngung NCC, admin-api (HMAC, chong phat lai), ma tran quyen.
 * Dung CSDL cong dev (.env), du lieu tam prefix T054, tu don. Chay: npx tsx scripts/test-core.ts
 */
try { process.loadEnvFile(".env"); } catch { /* da co bien moi truong */ }
(process.env as Record<string, string>).NODE_ENV = "test";

import crypto from "node:crypto";
import { NextRequest } from "next/server";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`OK    ${name}`); } else { failed++; console.log(`FAIL  ${name}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`); }
}

async function main() {
  const { db } = await import("../src/server/db");
  const { decryptSecret, encryptSecret, hashToken, checkPasswordStrength } = await import("../src/server/crypto");
  const { attemptPassword, consumeInviteWithPassword, issueOtp, peekInvite, verifyOtp, requestPasswordReset } = await import("../src/server/loginFlow");
  const { inviteUser, lockUser, changeRole, removeUser, setSupplierActive, UserAdminError } = await import("../src/server/userAdmin");
  const { outbox } = await import("../src/server/mailer");
  const { can, homeFor } = await import("../src/server/permissions");
  const { adminSignaturePayload, signAdmin, verifyAdminRequest } = await import("../src/server/adminAuth");
  const { env } = await import("../src/server/env");

  const tag = `T054${Date.now()}`;
  const actor = { label: "test", supplierId: 9_000_001, role: "TEST" };
  const lastMail = (kind: string, to: string) => [...outbox].reverse().find((m) => m.kind === kind && m.to === to);
  let credId = 0;
  try {
    // ---- 1. Ma hoa + bam
    const enc = encryptSecret("api-key-bi-mat-123456");
    check("1. ma hoa/giai ma API Key khop, chuoi ma hoa khong lo ban ro", decryptSecret(enc) === "api-key-bi-mat-123456" && !enc.includes("bi-mat"));
    let threw = false; try { decryptSecret(enc.slice(0, -4) + "AAAA"); } catch { threw = true; }
    check("1. sua ban ma -> giai ma that bai (GCM)", threw);
    check("1. hashToken on dinh + khac nhau", hashToken("a") === hashToken("a") && hashToken("a") !== hashToken("b") && hashToken("a").length === 64);
    check("1. mat khau: ngan/yeu/ok", checkPasswordStrength("abc123") === "short" && checkPasswordStrength("chulagiongnhau") === "weak" && checkPasswordStrength("MatKhau12345") === "ok");

    // ---- 2. Ma tran quyen
    check("2. chi ADMIN thay gia ban ra / cong no / bao gia / nguoi dung", can("ADMIN", "orders.price") && can("ADMIN", "payables.view") && can("ADMIN", "rfq.quote") && can("ADMIN", "users.manage")
      && !(["STAFF", "VIEWER", "COST_VIEWER"] as const).some((r) => can(r, "orders.price") || can(r, "payables.view") || can(r, "rfq.quote") || can(r, "users.manage")));
    check("2. STAFF: xac nhan don + dien gia dau vao, khong xoa NCC thu cap", can("STAFF", "orders.confirm") && can("STAFF", "costs.edit") && !can("STAFF", "costs.delete"));
    check("2. COST_VIEWER: chi thay gia dau vao (doc)", can("COST_VIEWER", "costs.view") && !can("COST_VIEWER", "costs.edit") && !can("COST_VIEWER", "orders.view") && homeFor("COST_VIEWER") === "/gia-dau-vao");
    check("2. VIEWER khong thay gia dau vao, khong sua", !can("VIEWER", "costs.view") && !can("VIEWER", "orders.confirm"));

    // ---- 3. Kich hoat: moi -> dat mat khau -> OTP
    const cred = await db.supplierCredential.create({ data: { crmSupplierId: 9_000_001, supplierCode: tag, supplierName: `NCC ${tag}`, apiKeyEnc: encryptSecret("k".repeat(32)) } });
    credId = cred.id;
    const admin = await inviteUser(cred.id, { email: `${tag}.a@test.vn`, name: "An", role: "ADMIN", locale: "vi" }, actor);
    const mail = lastMail("invite", admin.email)!;
    const token = /\/moi\/([A-Za-z0-9_-]+)/.exec(mail.vars.link)![1];
    check("3. thu moi chua lien ket + khong luu token thô trong CSDL", !!token && (await db.invite.count({ where: { tokenHash: hashToken(token) } })) === 1 && (await db.invite.count({ where: { tokenHash: token } })) === 0);
    check("3. tai khoan INVITED chua dang nhap duoc", (await attemptPassword({ email: admin.email, password: "BatKyMatKhau1", ip: null })).status === "bad");
    check("3. peekInvite hop le (khong danh dau da dung)", !!(await peekInvite(token, "ACTIVATE")) && !!(await peekInvite(token, "ACTIVATE")));
    check("3. dung sai muc dich (RESET) -> null", (await peekInvite(token, "RESET")) === null);
    const u1 = await consumeInviteWithPassword(token, "ACTIVATE", "MatKhauManh123");
    check("3. dat mat khau -> token het hieu luc (dung 1 lan)", !!u1 && (await peekInvite(token, "ACTIVATE")) === null && (await consumeInviteWithPassword(token, "ACTIVATE", "KhacXyz12345")) === null);

    await issueOtp(admin, "ACTIVATE");
    const code = lastMail("otp", admin.email)!.vars.code;
    check("3. ma OTP 6 so, luu bam", /^\d{6}$/.test(code) && (await db.otpCode.count({ where: { userId: admin.id, codeHash: code } })) === 0);
    const wrong = code === "000000" ? "111111" : "000000";
    check("3. OTP sai -> bad", (await verifyOtp(admin.id, "ACTIVATE", wrong)) === "bad");
    check("3. OTP dung sai muc dich (LOGIN) -> khong co ma", (await verifyOtp(admin.id, "LOGIN", code)) === "expired");
    check("3. OTP dung -> ok, dung lai -> het", (await verifyOtp(admin.id, "ACTIVATE", code)) === "ok" && (await verifyOtp(admin.id, "ACTIVATE", code)) === "expired");
    await db.supplierUser.update({ where: { id: admin.id }, data: { status: "ACTIVE" } });

    // OTP sai qua nhieu lan
    await issueOtp(admin, "LOGIN");
    const c2 = lastMail("otp", admin.email)!.vars.code;
    for (let i = 0; i < 5; i++) await verifyOtp(admin.id, "LOGIN", c2 === "999999" ? "111111" : "999999");
    check("3. sai OTP qua 5 lan -> tooMany (ke ca ma dung)", (await verifyOtp(admin.id, "LOGIN", c2)) === "tooMany");
    await issueOtp(admin, "LOGIN");
    check("3. gui ma moi -> dung duoc", (await verifyOtp(admin.id, "LOGIN", lastMail("otp", admin.email)!.vars.code)) === "ok");

    // ---- 4. Dang nhap + khoa tam
    const ok1 = await attemptPassword({ email: admin.email.toUpperCase(), password: "MatKhauManh123", ip: "10.0.0.1" });
    check("4. dang nhap dung (email khong phan biet hoa/thuong)", ok1.status === "ok" && ok1.user.id === admin.id);
    const staff = await inviteUser(cred.id, { email: `${tag}.s@test.vn`, name: "Ha", role: "STAFF", locale: "zh" }, actor);
    const stTok = /\/moi\/([A-Za-z0-9_-]+)/.exec(lastMail("invite", staff.email)!.vars.link)![1];
    await consumeInviteWithPassword(stTok, "ACTIVATE", "MatKhauHa12345");
    await db.supplierUser.update({ where: { id: staff.id }, data: { status: "ACTIVE" } });
    check("4. thu moi theo ngon ngu tai khoan (zh)", /邀请/.test(lastMail("invite", staff.email)!.subject));
    for (let i = 0; i < env.maxFailedLogins; i++) await attemptPassword({ email: staff.email, password: "SaiMatKhau12345", ip: "10.0.0.2" });
    const locked = await attemptPassword({ email: staff.email, password: "MatKhauHa12345", ip: "10.0.0.2" });
    check("4. sai du so lan -> khoa tam, ke ca khi nhap dung", locked.status === "locked", locked);
    check("4. gui email khoa cho nguoi dung + Quan tri cong ty", !!lastMail("lockedUser", staff.email) && !!lastMail("lockedAdmin", admin.email));
    const ghost = await attemptPassword({ email: `${tag}.khong-ton-tai@test.vn`, password: "x", ip: "10.0.0.3" });
    check("4. email khong ton tai -> bad (khong lo ton tai)", ghost.status === "bad");
    await db.loginAttempt.deleteMany({ where: { email: staff.email } });
    await db.supplierUser.update({ where: { id: staff.id }, data: { lockedUntil: null, failedLoginCount: 0 } });
    check("4. mo khoa -> dang nhap lai duoc", (await attemptPassword({ email: staff.email, password: "MatKhauHa12345", ip: "10.0.0.2" })).status === "ok");

    // ---- 5. Cung email o 2 NCC -> chon cong ty
    const cred2 = await db.supplierCredential.create({ data: { crmSupplierId: 9_000_002, supplierCode: `${tag}b`, supplierName: `NCC ${tag} B`, apiKeyEnc: encryptSecret("z".repeat(32)) } });
    try {
      const dup = await inviteUser(cred2.id, { email: staff.email, name: "Ha 2", role: "VIEWER" }, { ...actor, supplierId: 9_000_002 });
      const dTok = /\/moi\/([A-Za-z0-9_-]+)/.exec(lastMail("invite", dup.email)!.vars.link)![1];
      await consumeInviteWithPassword(dTok, "ACTIVATE", "MatKhauHa12345");
      await db.supplierUser.update({ where: { id: dup.id }, data: { status: "ACTIVE" } });
      const ch = await attemptPassword({ email: staff.email, password: "MatKhauHa12345", ip: null });
      check("5. cung email 2 cong ty -> yeu cau chon cong ty", ch.status === "choose" && ch.options.length === 2, ch);
      const ch2 = await attemptPassword({ email: staff.email, password: "MatKhauHa12345", credentialId: cred2.id, ip: null });
      check("5. chon cong ty -> vao dung tai khoan", ch2.status === "ok" && ch2.user.credentialId === cred2.id);
      let dupErr = ""; try { await inviteUser(cred.id, { email: staff.email, name: "x", role: "STAFF" }, actor); } catch (e) { dupErr = e instanceof UserAdminError ? e.code : "?"; }
      check("5. cung email 2 lan trong 1 cong ty -> exists", dupErr === "exists", dupErr);
    } finally {
      await db.supplierUser.deleteMany({ where: { credentialId: cred2.id } });
      await db.supplierCredential.delete({ where: { id: cred2.id } });
    }

    // ---- 6. Quan tri cuoi cung + huy phien
    const mkSession = (userId: number) => db.session.create({ data: { id: crypto.randomUUID(), userId, expiresAt: new Date(Date.now() + 3600_000) } });
    const dev = await db.deviceToken.create({ data: { userId: staff.id, tokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
    await mkSession(staff.id);
    let g = ""; try { await lockUser(cred.id, admin.id, actor); } catch (e) { g = e instanceof UserAdminError ? e.code : "?"; }
    check("6. khoa Quan tri cuoi cung -> bi chan", g === "lastAdmin", g);
    g = ""; try { await changeRole(cred.id, admin.id, "STAFF", actor); } catch (e) { g = e instanceof UserAdminError ? e.code : "?"; }
    check("6. ha quyen Quan tri cuoi cung -> bi chan", g === "lastAdmin", g);
    g = ""; try { await removeUser(cred.id, admin.id, actor); } catch (e) { g = e instanceof UserAdminError ? e.code : "?"; }
    check("6. xoa Quan tri cuoi cung -> bi chan", g === "lastAdmin", g);
    await changeRole(cred.id, staff.id, "ADMIN", actor); // co 2 quan tri
    check("6. doi vai tro huy phien ngay", (await db.session.count({ where: { userId: staff.id, revokedAt: null } })) === 0);
    const adminDev = await db.deviceToken.create({ data: { userId: admin.id, tokenHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
    await mkSession(admin.id);
    await lockUser(cred.id, admin.id, actor); // con staff la quan tri khac
    check("6. khoa tai khoan khi con quan tri khac -> ok, dang nhap bi tu choi", (await attemptPassword({ email: admin.email, password: "MatKhauManh123", ip: null })).status !== "ok");
    check("6. khoa tai khoan huy moi phien", (await db.session.count({ where: { userId: admin.id, revokedAt: null } })) === 0);
    check("6. khoa tai khoan thu hoi thiet bi da nho", !!(await db.deviceToken.findUniqueOrThrow({ where: { id: adminDev.id } })).revokedAt);
    g = ""; try { await lockUser(cred.id, staff.id, actor); } catch (e) { g = e instanceof UserAdminError ? e.code : "?"; }
    check("6. staff gio la Quan tri duy nhat -> khong khoa duoc", g === "lastAdmin", g);
    await db.deviceToken.findUniqueOrThrow({ where: { id: dev.id } });

    // ---- 7. Quen mat khau
    await requestPasswordReset(staff.email);
    const rm = lastMail("reset", staff.email);
    const rTok = /\/dat-lai\/([A-Za-z0-9_-]+)/.exec(rm?.vars.link ?? "")?.[1];
    check("7. quen mat khau gui lien ket cho tai khoan ACTIVE", !!rTok && !!(await peekInvite(rTok, "RESET")));
    const before = outbox.length;
    await requestPasswordReset(`${tag}.nobody@test.vn`);
    check("7. email khong ton tai -> khong gui thu (va khong bao loi)", outbox.length === before);
    check("7. token RESET khong dung duoc cho kich hoat", rTok ? (await peekInvite(rTok, "ACTIVATE")) === null : false);

    // ---- 8. Tam ngung NCC
    await setSupplierActive(cred.id, false, actor);
    check("8. NCC tam ngung -> khong ai dang nhap duoc", (await attemptPassword({ email: staff.email, password: "MatKhauHa12345", ip: null })).status !== "ok");
    await setSupplierActive(cred.id, true, actor);

    // ---- 9. admin-api HMAC
    const mkAdminReq = (o: { secret?: string; ts?: number; nonce?: string; body?: string; path?: string; name?: string } = {}) => {
      const method = "POST", body = o.body ?? "{}", path = o.path ?? "/admin-api/users/1/lock";
      const ts = String(o.ts ?? Math.floor(Date.now() / 1000)), nonce = o.nonce ?? crypto.randomUUID();
      const name = encodeURIComponent(o.name ?? "Nguyễn Mua Hàng");
      const sig = signAdmin(o.secret ?? env.adminHmacSecret, adminSignaturePayload({ method, pathWithQuery: path, bodyHash: crypto.createHash("sha256").update(body).digest("hex"), ts, nonce, user: "7", userName: name }));
      return new NextRequest(`http://localhost${path}`, { method, body, headers: { "x-crm-user": "7", "x-crm-user-name": name, "x-crm-ts": ts, "x-crm-nonce": nonce, "x-crm-sig": sig } });
    };
    const act = await verifyAdminRequest(mkAdminReq());
    check("9. admin-api: chu ky dung -> ten nguoi Mua hang", act.userId === "7" && act.userName === "Nguyễn Mua Hàng", act);
    const n = crypto.randomUUID();
    await verifyAdminRequest(mkAdminReq({ nonce: n }));
    const rep = await verifyAdminRequest(mkAdminReq({ nonce: n })).catch((e) => e);
    check("9. admin-api: nonce dung lai -> 403", rep?.status === 403);
    const bad1 = await verifyAdminRequest(mkAdminReq({ secret: "sai-bi-mat-sai-bi-mat-sai-bi-mat" })).catch((e) => e);
    check("9. admin-api: sai bi mat -> 403", bad1?.status === 403);
    const bad2 = await verifyAdminRequest(mkAdminReq({ ts: Math.floor(Date.now() / 1000) - 3600 })).catch((e) => e);
    check("9. admin-api: qua han -> 403", bad2?.status === 403);
    const tamp = mkAdminReq({ body: '{"a":1}' });
    const bad3 = await verifyAdminRequest(new NextRequest(tamp.url, { method: "POST", body: '{"a":2}', headers: tamp.headers })).catch((e) => e);
    check("9. admin-api: sua body sau khi ky -> 403", bad3?.status === 403);
    const bad4 = await verifyAdminRequest(new NextRequest("http://localhost/admin-api/users/1/lock", { method: "POST", body: "{}" })).catch((e) => e);
    check("9. admin-api: thieu chu ky -> 401", bad4?.status === 401);
  } finally {
    if (credId) {
      const users = await db.supplierUser.findMany({ where: { credentialId: credId }, select: { id: true } });
      const ids = users.map((u) => u.id);
      await db.session.deleteMany({ where: { userId: { in: ids } } });
      await db.deviceToken.deleteMany({ where: { userId: { in: ids } } });
      await db.otpCode.deleteMany({ where: { userId: { in: ids } } });
      await db.invite.deleteMany({ where: { userId: { in: ids } } });
      await db.supplierUser.deleteMany({ where: { credentialId: credId } });
      await db.supplierCredential.delete({ where: { id: credId } }).catch(() => {});
    }
    await db.loginAttempt.deleteMany({ where: { email: { contains: "T054" } } });
    await db.portalAudit.deleteMany({ where: { supplierId: { in: [9_000_001, 9_000_002] } } });
    await db.usedNonce.deleteMany({});
    console.log(`\n${passed} dat, ${failed} loi`);
    await db.$disconnect();
    process.exit(failed ? 1 : 0);
  }
}
main();
