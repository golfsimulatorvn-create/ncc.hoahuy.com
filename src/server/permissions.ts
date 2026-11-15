import type { PortalRole } from "@prisma/client";

/**
 * Bang quyen co dinh cua cong NCC (specs/054 research.md R5) — KIEM O MAY CHU o moi Server Action / route; an nut tren
 * giao dien chi la tien loi. Gia ban ra cho Hoa Huy (don gia, thanh tien, bao gia RFQ, cong no) CHI ADMIN.
 */
export type Perm =
  | "orders.view" | "orders.price" | "orders.confirm"
  | "rfq.view" | "rfq.quote"
  | "payables.view" | "payables.reconcile"
  | "claims.view" | "claims.respond"
  | "docs.view" | "docs.upload"
  | "costs.view" | "costs.edit" | "costs.delete"
  | "users.manage";

const MATRIX: Record<PortalRole, readonly Perm[]> = {
  ADMIN: ["orders.view", "orders.price", "orders.confirm", "rfq.view", "rfq.quote", "payables.view", "payables.reconcile", "claims.view", "claims.respond", "docs.view", "docs.upload", "costs.view", "costs.edit", "costs.delete", "users.manage"],
  STAFF: ["orders.view", "orders.confirm", "rfq.view", "claims.view", "claims.respond", "docs.view", "docs.upload", "costs.view", "costs.edit"],
  VIEWER: ["orders.view", "rfq.view", "claims.view", "docs.view"],
  COST_VIEWER: ["costs.view"],
};

export function can(role: PortalRole, perm: Perm): boolean {
  return MATRIX[role].includes(perm);
}

export class ForbiddenError extends Error {
  constructor(public perm: Perm) {
    super(`Không có quyền: ${perm}`);
  }
}

export function assertCan(role: PortalRole, perm: Perm): void {
  if (!can(role, perm)) throw new ForbiddenError(perm);
}

/** Muc menu trai theo vai tro, thu tu hien thi. */
export const NAV: { key: string; href: string; perm: Perm }[] = [
  { key: "orders", href: "/don-mua", perm: "orders.view" },
  { key: "rfq", href: "/bao-gia", perm: "rfq.view" },
  { key: "payables", href: "/cong-no", perm: "payables.view" },
  { key: "claims", href: "/khieu-nai", perm: "claims.view" },
  { key: "docs", href: "/chung-tu", perm: "docs.view" },
  { key: "costs", href: "/gia-dau-vao", perm: "costs.view" },
  { key: "users", href: "/nguoi-dung", perm: "users.manage" },
];

/** Trang dau tien ma vai tro nay duoc vao (COST_VIEWER chi co Gia dau vao). */
export function homeFor(role: PortalRole): string {
  return NAV.find((n) => can(role, n.perm))?.href ?? "/dang-nhap";
}
