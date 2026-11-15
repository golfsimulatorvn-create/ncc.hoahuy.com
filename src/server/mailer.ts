import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { env } from "./env";
import { translator } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";

/**
 * Gui email (moi, ma xac thuc, dat lai mat khau, canh bao). Noi dung theo ngon ngu tai khoan qua namespace `email`.
 * SMTP_HOST de trong => ghi ra console va luu vao `outbox` (CHI de phat trien / kiem thu; production phai co SMTP).
 */
export type MailKind = "invite" | "otp" | "reset" | "newDevice" | "lockedUser" | "lockedAdmin";

export const outbox: { to: string; kind: MailKind; subject: string; text: string; vars: Record<string, string> }[] = [];

export async function sendMail(kind: MailKind, locale: Locale, to: string, vars: Record<string, string>): Promise<void> {
  const t = translator(locale, "email");
  const subject = t(`${kind}.subject`, vars);
  const text = t(`${kind}.body`, vars) + "\n\n" + t("footer");
  if (!env.smtpConfigured) {
    outbox.push({ to, kind, subject, text, vars });
    if (outbox.length > 200) outbox.shift();
    // Chi phat trien/kiem thu (khong bao gio o production): ghi them ra tep de E2E doc ma OTP / lien ket moi.
    if (process.env.NODE_ENV !== "production") {
      try { fs.appendFileSync(path.join(process.cwd(), ".dev-outbox.jsonl"), JSON.stringify({ to, kind, subject, vars, at: Date.now() }) + "\n"); } catch { /* bo qua */ }
    }
    if (process.env.NODE_ENV !== "test") console.log(`[mail:${kind}] -> ${to}\n  ${subject}\n  ${text.replace(/\n/g, "\n  ")}`);
    return;
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.MAIL_FROM || "no-reply@hoahuy.com", to, subject, text });
}
