import { NextResponse } from "next/server";
import { CrmError } from "./crmClient";
import { fetchFile } from "./crmClaims";
import { can, type Perm } from "./permissions";
import { getSessionUser } from "./session";

/** Chuyen tiep tep tu CRM cho trinh duyet NCC (trinh duyet khong cham CRM): kiem phien + quyen, luon tai xuong, khong cache chung. */
export async function proxyFile(perm: Perm, crmPath: (id: number, aid?: number) => string, id: string, aid?: string): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!can(user.role, perm)) return new NextResponse(null, { status: 403 });
  const n = Number(id), a = aid === undefined ? undefined : Number(aid);
  if (!Number.isInteger(n) || n <= 0 || (a !== undefined && (!Number.isInteger(a) || a <= 0))) return new NextResponse(null, { status: 400 });
  try {
    const res = await fetchFile(user, crmPath(n, a));
    const headers = new Headers();
    for (const h of ["content-type", "content-disposition", "content-length"]) { const v = res.headers.get(h); if (v) headers.set(h, v); }
    headers.set("x-content-type-options", "nosniff");
    headers.set("cache-control", "private, no-store");
    return new NextResponse(res.body, { status: 200, headers });
  } catch (e) {
    if (e instanceof CrmError) return new NextResponse(null, { status: e.status === 404 ? 404 : 502 });
    throw e;
  }
}
