import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { homeFor } from "@/server/permissions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? homeFor(user.role) : "/dang-nhap");
}
