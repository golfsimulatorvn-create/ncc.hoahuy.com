import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { withAdminApi } from "@/server/adminAuth";
import { lockUser } from "@/server/userAdmin";

/** POST /admin-api/users/{id}/lock — khoa tai khoan, huy moi phien va thiet bi ngay. 409 neu la Quan tri cuoi cung. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAdminApi(req, async (actor) => {
    const u = await db.supplierUser.findFirst({ where: { id: Number((await params).id), deletedAt: null }, include: { credential: true } });
    if (!u) return NextResponse.json({ ok: false, message: "Không tìm thấy người dùng." }, { status: 404 });
    await lockUser(u.credentialId, u.id, { label: `CRM:${actor.userName}`, supplierId: u.credential.crmSupplierId, role: "CRM" });
    return NextResponse.json({ ok: true });
  });
}
