/** Doc bien moi truong co kiem tra (khong bao gio ghi gia tri ra log). */
function need(name: string, minLen = 1): string {
  const v = process.env[name]?.trim() ?? "";
  if (v.length < minLen) throw new Error(`Thiếu hoặc quá ngắn biến môi trường ${name}.`);
  return v;
}

export const env = {
  get appUrl() { return (process.env.APP_URL?.trim() || "http://localhost:3200").replace(/\/$/, ""); },
  get crmBaseUrl() { return need("CRM_BASE_URL").replace(/\/$/, ""); },
  get crmHmacSecret() { return need("CRM_HMAC_SECRET", 24); },
  get adminHmacSecret() { return need("PORTAL_ADMIN_HMAC_SECRET", 24); },
  get credEncKey(): Buffer {
    const hex = need("CRED_ENC_KEY", 64);
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("CRED_ENC_KEY phải là 64 ký tự hex (32 byte).");
    return Buffer.from(hex, "hex");
  },
  get tokenPepper() { return need("TOKEN_PEPPER", 32); },
  get sessionIdleMinutes() { return Number(process.env.SESSION_IDLE_MINUTES ?? 30); },
  get sessionMaxHours() { return Number(process.env.SESSION_MAX_HOURS ?? 12); },
  get deviceDays() { return Number(process.env.DEVICE_TRUST_DAYS ?? 180); },
  get maxFailedLogins() { return Number(process.env.MAX_FAILED_LOGINS ?? 5); },
  get lockMinutes() { return Number(process.env.LOCK_MINUTES ?? 15); },
  get otpMinutes() { return Number(process.env.OTP_MINUTES ?? 10); },
  get inviteHours() { return Number(process.env.INVITE_HOURS ?? 72); },
  get maxFileMb() { return Number(process.env.MAX_FILE_MB ?? 10); },
  get smtpConfigured() { return !!process.env.SMTP_HOST?.trim(); },
  get clamdConfigured() { return !!process.env.CLAMD_HOST?.trim(); },
};
