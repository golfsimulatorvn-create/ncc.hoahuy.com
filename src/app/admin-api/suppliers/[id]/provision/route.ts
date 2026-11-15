import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { encryptSecret } from "@/server/crypto";
import { withAdminApi } from "@/server/adminAuth";
import { inviteUser, UserAdminError } from "@/server/userAdmin";
import { writePortalAudit } from "@/server/audit";

const schema = z.object({
  supplierCode: z.string().trim().min(1).max(50),
  supplierName: z.string().trim().min(1).max(300),
  adminEmail: z.string().trim().toLowerCase().email().max(200),
  adminName: z.string().trim().min(1).max(200),
  locale: z.enum(["vi", "zh", "en"]).default("vi"),
  apiKey: z.string().min(16).max(200),
});

/** POST /admin-api/suppliers/{crmSupplierId}/provision — CRM tao NCC o cong + Quan tri dau tien, gui thu moi.
 * 409 neu NCC da co Quan tri (dung "reset-password"/"users" de quan ly tiep). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAdminApi(req, async (actor) => {
    const crmSupplierId = Number((await params).id);
    if (!Number.isInteger(crmSupplierId) || crmSupplierId <= 0) return NextResponse.json({ ok: false, message: "Mã NCC không hợp lệ." }, { status: 400 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." }, { status: 422 });
    const d = parsed.data;

    const existing = await db.supplierCredential.findUnique({ where: { crmSupplierId } });
    if (existing && (await db.supplierUser.count({ where: { credentialId: existing.id, role: "ADMIN", deletedAt: null } })) > 0) {
      throw new UserAdminError("hasAdmin", "NCC này đã có tài khoản Quản trị.");
    }
    const cred = await db.supplierCredential.upsert({
      where: { crmSupplierId },
      update: { supplierCode: d.supplierCode, supplierName: d.supplierName, apiKeyEnc: encryptSecret(d.apiKey), active: true, rotatedAt: new Date() },
      create: { crmSupplierId, supplierCode: d.supplierCode, supplierName: d.supplierName, apiKeyEnc: encryptSecret(d.apiKey) },
    });
    const user = await inviteUser(cred.id, { email: d.adminEmail, name: d.adminName, role: "ADMIN", locale: d.locale }, { label: `CRM:${actor.userName}`, supplierId: crmSupplierId, role: "CRM" });
    await writePortalAudit({ supplierId: crmSupplierId, action: "SUPPLIER_PROVISIONED", detail: { by: actor.userName, adminEmail: d.adminEmail } });
    return NextResponse.json({ ok: true, data: { credentialId: cred.id, userId: user.id } });
  });
}
