import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { withAdminApi } from "@/server/adminAuth";

/** GET /admin-api/suppliers/{crmSupplierId}/users — danh sach tai khoan cua NCC (khong bao gio tra mat khau/khoa). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAdminApi(req, async () => {
    const crmSupplierId = Number((await params).id);
    const cred = await db.supplierCredential.findUnique({ where: { crmSupplierId } });
    if (!cred) return NextResponse.json({ ok: true, data: { provisioned: false, active: false, users: [] } });
    const users = await db.supplierUser.findMany({ where: { credentialId: cred.id, deletedAt: null }, orderBy: { id: "asc" } });
    return NextResponse.json({
      ok: true,
      data: {
        provisioned: true, active: cred.active, hasKey: !!cred.apiKeyEnc,
        users: users.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName, role: u.role, status: u.status, lastLoginAt: u.lastLoginAt })),
      },
    });
  });
}
