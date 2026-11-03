import type { PermissionKey } from "../config/permissions.config";
import type { SidebarItem } from "../config/sidebar.config";

export interface PermissionHolder {
  permissions: readonly string[];
}

/** UI visibility helper. Not a security boundary — the server re-checks every action. */
export function hasPermission(user: PermissionHolder | null | undefined, permission: PermissionKey): boolean {
  return !!user && user.permissions.includes(permission);
}

export function hasAnyPermission(user: PermissionHolder | null | undefined, list: PermissionKey[]): boolean {
  return list.some((p) => hasPermission(user, p));
}

/** Filter sidebar entries (and their children) down to what the user may see. */
export function filterSidebar(items: SidebarItem[], user: PermissionHolder | null | undefined): SidebarItem[] {
  return items
    .filter((item) => hasPermission(user, item.permission))
    .map((item) =>
      item.children
        ? { ...item, children: item.children.filter((c) => hasPermission(user, c.permission)) }
        : item
    );
}
