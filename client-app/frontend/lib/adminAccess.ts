/**
 * Which permission opens each admin screen. Longest matching prefix wins, so
 * /admin/billing/analytics inherits /admin/billing. Screens not listed are open
 * to any signed-in staff member. The sidebar, the command palette and the admin
 * layout all read this one map, so a screen the role cannot use is neither
 * listed nor reachable by URL.
 */
export const ADMIN_SCREEN_PERMISSION: Readonly<Record<string, string>> = {
  "/admin/appointments": "appointments:read",
  "/admin/patients": "patients:read",
  "/admin/inventory": "inventory:read",
  "/admin/expenses": "expenses:read",
  "/admin/billing": "billing:read",
  "/admin/payments": "billing:read",
  "/admin/roles": "staff:read",
};

/** The permission a path needs, or null when any staff member may open it. */
export function screenPermission(pathname: string): string | null {
  const match = Object.keys(ADMIN_SCREEN_PERMISSION)
    .filter((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ADMIN_SCREEN_PERMISSION[match] : null;
}
