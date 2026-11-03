import type { PermissionKey } from "../shared/config/permissions.config";
import type { AuthUser } from "../shared/auth";
import { forbidden } from "../shared/errors";

export function userHas(user: AuthUser, permission: PermissionKey): boolean {
  return user.permissions.includes(permission);
}

/** Throws FORBIDDEN unless the user holds the permission. */
export function requirePermission(user: AuthUser, permission: PermissionKey): void {
  if (!userHas(user, permission)) throw forbidden("You do not have permission");
}

/** Throws FORBIDDEN unless the user holds at least one of the permissions. */
export function requireAnyPermission(user: AuthUser, list: PermissionKey[]): void {
  if (!list.some((p) => userHas(user, p))) throw forbidden("You do not have permission");
}
