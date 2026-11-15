import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { withAdminApi } from "@/server/adminAuth";
import { setSupplierActive } from "@/server/userAdmin";

/** POST /admin-api/suppliers/{crmSupplierId}/suspend — tam ngung ca NCC (ngung hop tac): huy moi phien ngay. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAdminApi(req, async (actor) => {
    const crmSupplierId = Number((await params).id);
    const cred = await db.supplierCredential.findUnique({ where: { crmSupplierId } });
    if (!cred) return NextResponse.json({ ok: false, message: "Không tìm thấy nhà cung cấp." }, { status: 404 });
    await setSupplierActive(cred.id, false, { label: `CRM:${actor.userName}`, supplierId: crmSupplierId });
    return NextResponse.json({ ok: true });
  });
}
