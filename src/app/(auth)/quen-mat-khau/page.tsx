import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/AuthShell";
import { ForgotForm } from "@/components/AuthForms";

export const dynamic = "force-dynamic";

export default async function ForgotPage() {
  const t = await getTranslations("auth.forgot");
  return (
    <AuthShell code={t("code")} back="/quen-mat-khau">
      <ForgotForm />
    </AuthShell>
  );
}
