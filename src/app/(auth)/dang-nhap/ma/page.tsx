import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { OtpForm } from "@/components/AuthForms";
import { db } from "@/server/db";
import { readPending } from "@/server/pending";

export const dynamic = "force-dynamic";

export default async function OtpPage() {
  const pending = await readPending();
  if (!pending) redirect("/dang-nhap");
  const user = await db.supplierUser.findFirst({ where: { id: pending.u, deletedAt: null }, select: { email: true } });
  if (!user) redirect("/dang-nhap");
  return (
    <AuthShell>
      <OtpForm email={user.email} newDevice={pending.p === "LOGIN"} />
    </AuthShell>
  );
}
