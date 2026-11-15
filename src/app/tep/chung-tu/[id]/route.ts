import type { NextRequest } from "next/server";
import { proxyFile } from "@/server/fileProxy";

/** Tai chung tu NCC da tai len (qua CRM, co kiem quyen docs.view). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyFile("docs.view", (n) => `/api/supplier/documents/${n}/download`, id);
}
