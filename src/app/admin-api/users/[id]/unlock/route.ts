import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { withAdminApi } from "@/server/adminAuth";
import { unlockUser } from "@/server/userAdmin";

/** POST /admin-api/users/{id}/unlock — mo khoa tai khoan. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAdminApi(req, async (actor) => {
    const u = await db.supplierUser.findFirst({ where: { id: Number((await params).id), deletedAt: null }, include: { credential: true } });
    if (!u) return NextResponse.json({ ok: false, message: "Không tìm thấy người dùng." }, { status: 404 });
    await unlockUser(u.credentialId, u.id, { label: `CRM:${actor.userName}`, supplierId: u.credential.crmSupplierId, role: "CRM" });
    return NextResponse.json({ ok: true });
  });
}
