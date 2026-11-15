import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __portalDb?: PrismaClient };

/** Ket noi CSDL rieng cua cong (chi tai khoan/phien/nhat ky; du lieu nghiep vu luon doc tu CRM). */
export const db = g.__portalDb ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.__portalDb = db;
