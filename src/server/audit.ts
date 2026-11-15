import { db } from "./db";

/** Nhat ky hanh dong tren cong (T-audit). Khong bao gio nem loi ra ngoai va KHONG bao gio ghi mat khau/OTP/khoa API/ten tep nhay cam. */
export async function writePortalAudit(input: {
  requestId?: string;
  userId?: number | null;
  supplierId?: number | null;
  role?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | number | null;
  detail?: unknown;
  ip?: string | null;
}): Promise<void> {
  try {
    await db.portalAudit.create({
      data: {
        requestId: input.requestId ?? "-", userId: input.userId ?? null, supplierId: input.supplierId ?? null, role: input.role ?? null,
        action: input.action, entity: input.entity ?? null, entityId: input.entityId != null ? String(input.entityId) : null,
        detail: (input.detail ?? undefined) as never, ip: input.ip ?? null,
      },
    });
  } catch (e) {
    console.error("[portal-audit] khong ghi duoc:", e);
  }
}
