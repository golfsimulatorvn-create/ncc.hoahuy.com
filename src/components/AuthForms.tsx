"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { activateAction, forgotAction, loginAction, resendOtpAction, resetPasswordAction, verifyOtpAction, type AuthState } from "@/app/(auth)/actions";

function Msg({ s }: { s: AuthState | undefined }) {
  if (!s?.error && !s?.info) return null;
  return (
    <p role={s.error ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-[13px] ${s.error ? "bg-danger-bg text-danger-fg" : "bg-ok-bg text-ok-fg"}`}>{s.error ?? s.info}</p>
  );
}

export function LoginForm() {
  const t = useTranslations("auth.login");
  const [state, action, pending] = useActionState(loginAction, undefined);
  const [picked, setPicked] = useState<number | null>(null);
  if (state?.choose) {
    return (
      <form action={action} className="grid gap-3">
        <div><div className="text-[18px] font-bold">{t("chooseTitle")}</div><p className="mt-1 text-ink-2">{t("chooseHint")}</p></div>
        <input type="hidden" name="email" value={state.email} />
        <input type="hidden" name="password" value={state.password} />
        <fieldset className="grid gap-2">
          {state.choose.map((o) => (
            <label key={o.credentialId} className="flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-3 py-2">
              <input type="radio" name="credentialId" value={o.credentialId} required checked={picked === o.credentialId} onChange={() => setPicked(o.credentialId)} />
              <span className="min-w-0 break-words">{o.supplierName}</span>
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={pending || picked == null} className="btn-primary">{t("chooseSubmit")}</button>
      </form>
    );
  }
  return (
    <form action={action} className="grid gap-3">
      <div className="text-[22px] font-bold">{t("title")}</div>
      <Msg s={state} />
      <label className="field">{t("email")}<input name="email" type="email" required autoComplete="username" defaultValue={state?.email} className="input" /></label>
      <label className="field">{t("password")}<input name="password" type="password" required autoComplete="current-password" className="input" /></label>
      <button type="submit" disabled={pending} className="btn-primary">{t("submit")}</button>
      <a href="/quen-mat-khau" className="text-[13px]">{t("forgot")}</a>
    </form>
  );
}

export function OtpForm({ email, newDevice }: { email: string; newDevice: boolean }) {
  const t = useTranslations("auth.otp");
  const td = useTranslations("auth");
  const [state, action, pending] = useActionState(verifyOtpAction, undefined);
  const [resent, resend, resending] = useActionState(resendOtpAction, undefined);
  return (
    <div className="grid gap-3">
      <div className="text-[11px] font-semibold tracking-wide text-part-fg">{t("when").toUpperCase()}</div>
      <div><div className="text-[18px] font-bold">{newDevice ? t("titleNewDevice") : t("title")}</div><p className="mt-1 text-ink-2">{t("hint", { email, minutes: 10 })}</p></div>
      <Msg s={state ?? resent} />
      <form action={action} className="grid gap-3">
        <label className="field">{t("code")}
          <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required className="input text-center text-[22px] tracking-[0.4em]" />
        </label>
        <button type="submit" disabled={pending} className="btn-primary">{t("submit")}</button>
      </form>
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <span className="text-ink-2">{t("deviceNote", { days: 180 })}</span>
        <form action={resend} className="ml-auto"><button type="submit" disabled={resending} className="underline">{t("resend")}</button></form>
      </div>
      <a href="/dang-nhap" className="text-[13px]">{td("forgot.back")}</a>
    </div>
  );
}

export function SetPasswordForm({ token, mode, name, email, supplier }: { token: string; mode: "ACTIVATE" | "RESET"; name: string; email: string; supplier: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(mode === "ACTIVATE" ? activateAction : resetPasswordAction, undefined);
  const k = mode === "ACTIVATE" ? "invite" : "reset";
  return (
    <form action={action} className="grid gap-3">
      <div className="text-[22px] font-bold">{t(`${k}.title`)}</div>
      <p className="text-ink-2">{mode === "ACTIVATE" ? t("invite.intro", { name, email, supplier }) : t("reset.intro", { email })}</p>
      <Msg s={state} />
      <input type="hidden" name="token" value={token} />
      <label className="field">{t("invite.password")}<input name="password" type="password" required minLength={10} autoComplete="new-password" className="input" /></label>
      <label className="field">{t("invite.confirm")}<input name="confirm" type="password" required minLength={10} autoComplete="new-password" className="input" /></label>
      <p className="text-[12px] text-ink-muted">{t("invite.hint")}</p>
      <button type="submit" disabled={pending} className="btn-primary">{t(`${k}.submit`)}</button>
    </form>
  );
}

export function ForgotForm() {
  const t = useTranslations("auth.forgot");
  const [state, action, pending] = useActionState(forgotAction, undefined);
  return (
    <form action={action} className="grid gap-3">
      <div className="text-[22px] font-bold">{t("title")}</div>
      <p className="text-ink-2">{t("intro")}</p>
      <Msg s={state} />
      <label className="field">Email<input name="email" type="email" required autoComplete="username" className="input" /></label>
      <button type="submit" disabled={pending} className="btn-primary">{t("submit")}</button>
      <a href="/dang-nhap" className="text-[13px]">{t("back")}</a>
    </form>
  );
}
