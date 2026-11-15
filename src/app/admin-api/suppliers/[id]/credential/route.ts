import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { encryptSecret } from "@/server/crypto";
import { withAdminApi } from "@/server/adminAuth";
import { writePortalAudit } from "@/server/audit";
import { revokeUserSessions } from "@/server/session";

const schema = z.union([z.object({ apiKey: z.string().min(16).max(200) }), z.object({ revoke: z.literal(true) })]);

/** PUT /admin-api/suppliers/{crmSupplierId}/credential — CRM doi khoa API (apiKey) hoac thu hoi ({revoke:true}):
 * thu hoi => NCC tam ngung ngay, moi phien bi huy; cap khoa moi => mo lai. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAdminApi(req, async (actor) => {
    const crmSupplierId = Number((await params).id);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!Number.isInteger(crmSupplierId) || crmSupplierId <= 0 || !parsed.success) return NextResponse.json({ ok: false, message: "Dữ liệu không hợp lệ." }, { status: 422 });
    const cred = await db.supplierCredential.findUnique({ where: { crmSupplierId } });
    if (!cred) return NextResponse.json({ ok: false, message: "Không tìm thấy nhà cung cấp." }, { status: 404 });

    if ("revoke" in parsed.data) {
      await db.supplierCredential.update({ where: { id: cred.id }, data: { apiKeyEnc: null, active: false, rotatedAt: new Date() } });
      for (const u of await db.supplierUser.findMany({ where: { credentialId: cred.id }, select: { id: true } })) await revokeUserSessions(u.id);
      await writePortalAudit({ supplierId: crmSupplierId, action: "CREDENTIAL_REVOKED", detail: { by: actor.userName } });
    } else {
      await db.supplierCredential.update({ where: { id: cred.id }, data: { apiKeyEnc: encryptSecret(parsed.data.apiKey), active: true, keyVersion: { increment: 1 }, rotatedAt: new Date() } });
      await writePortalAudit({ supplierId: crmSupplierId, action: "CREDENTIAL_ROTATED", detail: { by: actor.userName } });
    }
    return NextResponse.json({ ok: true });
  });
}
