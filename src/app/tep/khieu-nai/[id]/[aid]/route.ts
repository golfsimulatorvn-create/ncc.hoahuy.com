import type { NextRequest } from "next/server";
import { proxyFile } from "@/server/fileProxy";

/** Tai anh minh hoa Hoa Huy dinh kem khieu nai da chia se (co kiem quyen claims.view). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = await params;
  return proxyFile("claims.view", (n, a) => `/api/supplier/claims/${n}/attachments/${a}`, id, aid);
}
