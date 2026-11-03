// Source of truth for application roles. Roles are NOT stored in a database table.
//
// - `users.role` holds one of the keys below (or NULL for no role).
// - `users.permissions` holds a JSON array of `permissions.id` values; that array is
//   what actually authorizes the user (see lib/auth.ts).
// - `defaultPermissions` is the set copied into `users.permissions` when an administrator
//   assigns the role. Individual permissions can then be adjusted per user.
// - Approval workflow stages of type ROLE route to every active user whose `users.role`
//   equals the stage's `role_key`.

import { PERMISSION_KEYS, type PermissionKey } from "./permissions.config";

const EMPLOYEE_BASE: PermissionKey[] = ["dashboard.view", "request.create", "request.view", "asset.view"];

export const roles = {
  EMPLOYEE: {
    name: "Employee",
    description: "Create and track own requests and assets",
    defaultPermissions: EMPLOYEE_BASE,
  },
  REPORTING_MANAGER: {
    name: "Reporting Manager",
    description: "Employee access plus approving requests from direct reports",
    defaultPermissions: [...EMPLOYEE_BASE, "request.approve", "approve.button"],
  },
  IT_ADMIN: {
    name: "IT Admin",
    description: "Reviews requests, manages stock and issues hardware",
    defaultPermissions: [
      ...EMPLOYEE_BASE,
      "request.it_review",
      "request.view.all",
      "request.approve",
      "approve.button",
      "inventory.view",
      "inventory.manage",
      "asset.view.all",
      "asset.create",
      "asset.assign",
      "asset.return",
      "item.view",
      "item.create",
      "item.edit",
      "item.bulk_upload",
      "employee.view",
      "reports.view",
    ],
  },
  AUDITOR: {
    name: "Auditor",
    description: "Read-only access to records and audit history",
    defaultPermissions: ["dashboard.view", "request.view", "request.view.all", "inventory.view", "asset.view.all", "item.view", "audit.view", "reports.view"],
  },
  SUPER_ADMIN: {
    name: "Super Admin",
    description: "Application configuration: user access, workflows and master data",
    defaultPermissions: [
      ...EMPLOYEE_BASE,
      "admin.roles.manage",
      "admin.workflow.manage",
      "admin.master_data.manage",
      "item.view",
      "item.create",
      "item.edit",
      "item.delete",
      "item.bulk_upload",
      "audit.view",
      "employee.view",
    ],
  },
  ADMINISTRATOR: {
    name: "Administrator",
    description: "Full access: every permission in the catalogue",
    defaultPermissions: [...PERMISSION_KEYS],
  },
} as const satisfies Record<string, { name: string; description: string; defaultPermissions: readonly PermissionKey[] }>;

export type RoleKey = keyof typeof roles;

export const ROLE_KEYS = Object.keys(roles) as RoleKey[];

export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(roles, value);
}

export function roleName(key: string | null | undefined): string | null {
  return isRoleKey(key) ? roles[key].name : null;
}

/** Role list for API responses / UI pickers. */
export function listRoleDefinitions() {
  return ROLE_KEYS.map((key) => ({
    key,
    name: roles[key].name,
    description: roles[key].description,
    defaultPermissions: [...roles[key].defaultPermissions] as PermissionKey[],
  }));
}
