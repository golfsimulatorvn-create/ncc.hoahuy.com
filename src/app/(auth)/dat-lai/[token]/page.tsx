import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/AuthShell";
import { SetPasswordForm } from "@/components/AuthForms";
import { peekInvite } from "@/server/loginFlow";

export const dynamic = "force-dynamic";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("auth");
  const inv = await peekInvite(token, "RESET");
  return (
    <AuthShell back={`/dat-lai/${token}`}>
      {inv ? (
        <SetPasswordForm token={token} mode="RESET" name={inv.user.displayName} email={inv.user.email} supplier={inv.user.credential.supplierName} />
      ) : (
        <div className="grid gap-3"><p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-danger-fg">{t("invite.invalid")}</p><a href="/dang-nhap">{t("forgot.back")}</a></div>
      )}
    </AuthShell>
  );
}
