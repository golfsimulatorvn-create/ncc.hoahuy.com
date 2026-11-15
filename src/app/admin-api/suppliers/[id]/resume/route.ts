import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { withAdminApi } from "@/server/adminAuth";
import { setSupplierActive } from "@/server/userAdmin";

/** POST /admin-api/suppliers/{crmSupplierId}/resume — mo lai NCC da tam ngung (can con API Key hop le). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAdminApi(req, async (actor) => {
    const crmSupplierId = Number((await params).id);
    const cred = await db.supplierCredential.findUnique({ where: { crmSupplierId } });
    if (!cred) return NextResponse.json({ ok: false, message: "Không tìm thấy nhà cung cấp." }, { status: 404 });
    if (!cred.apiKeyEnc) return NextResponse.json({ ok: false, message: "NCC chưa có API Key, hãy cấp khóa trước.", code: "NO_KEY" }, { status: 409 });
    await setSupplierActive(cred.id, true, { label: `CRM:${actor.userName}`, supplierId: crmSupplierId });
    return NextResponse.json({ ok: true });
  });
}
