import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/components/AuthForms";
import { getSessionUser } from "@/server/session";
import { homeFor } from "@/server/permissions";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));
  const t = await getTranslations("auth.login");
  return (
    <AuthShell code={t("code")}>
      <LoginForm />
    </AuthShell>
  );
}
