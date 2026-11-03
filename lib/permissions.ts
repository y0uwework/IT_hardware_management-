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

function holds(user: PermissionHolder | null | undefined, permission: PermissionKey | PermissionKey[]) {
  return Array.isArray(permission) ? hasAnyPermission(user, permission) : hasPermission(user, permission);
}

/**
 * Filter sidebar entries (and their children) down to what the user may see. When the
 * parent's own route is not visible to the user, it points at their first visible child.
 */
export function filterSidebar(items: SidebarItem[], user: PermissionHolder | null | undefined): SidebarItem[] {
  return items
    .filter((item) => holds(user, item.permission))
    .map((item) => {
      if (!item.children) return item;
      const children = item.children.filter((c) => holds(user, c.permission));
      const route = children.length && !children.some((c) => c.route === item.route) ? children[0].route : item.route;
      return { ...item, route, children };
    });
}
