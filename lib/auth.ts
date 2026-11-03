import type { IncomingMessage } from "http";
import { prisma } from "./prisma";
import { getSessionCookie, readSessionToken } from "./session";
import { isRoleKey, roleName, type RoleKey } from "../config/roles.config";

/** Parse the users.permissions JSON column into permission IDs. Invalid content yields []. */
export function parsePermissionIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.filter((v): v is number => Number.isInteger(v) && v > 0))).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/** Serialize permission IDs for the users.permissions column. */
export function serializePermissionIds(ids: Iterable<number>): string {
  return JSON.stringify(Array.from(new Set(ids)).sort((a, b) => a - b));
}

/**
 * The authenticated actor, as seen by every API route and protected page.
 * `role` is a key from config/roles.config.ts; `permissions` are the keys resolved from users.permissions (IDs).
 */
export interface AuthUser {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string | null;
  department: string | null;
  designation: string | null;
  managerId: number | null;
  role: RoleKey | null;
  roleName: string | null;
  permissions: string[];
}

/** Load a user and their effective permissions from the database. Returns null for inactive users. */
export async function loadAuthUser(userId: number): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      email: true,
      department: true,
      designation: true,
      managerId: true,
      isActive: true,
      role: true,
      permissions: true,
    },
  });
  if (!user || !user.isActive) return null;

  const ids = parsePermissionIds(user.permissions);
  const permissions = ids.length
    ? (await prisma.permission.findMany({ where: { id: { in: ids } }, select: { permissionKey: true } }))
        .map((p) => p.permissionKey)
        .sort()
    : [];
  const role = isRoleKey(user.role) ? user.role : null;

  return {
    id: user.id,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    email: user.email,
    department: user.department,
    designation: user.designation,
    managerId: user.managerId,
    role,
    roleName: roleName(role),
    permissions,
  };
}

/** Resolve the current user from the session cookie (API routes and getServerSideProps). */
export async function getAuthUser(req: IncomingMessage): Promise<AuthUser | null> {
  const session = await readSessionToken(getSessionCookie(req));
  if (!session) return null;
  return loadAuthUser(session.userId);
}

export type AuthMode = "dev" | "external";

export function authMode(): AuthMode {
  return process.env.AUTH_MODE === "dev" ? "dev" : "external";
}

/**
 * Credential verification.
 *
 * INTEGRATION POINT: replace the "external" branch with the organization's existing
 * authentication (SSO / existing session / existing password verification). It must
 * return the existing `users.id` of the verified person, or null.
 *
 * "dev" mode signs in by employee code only and is refused in production builds.
 */
export async function verifyCredentials(input: { employeeCode: string; password?: string }): Promise<number | null> {
  if (authMode() === "dev") {
    if (process.env.NODE_ENV === "production") return null;
    const user = await prisma.user.findFirst({
      where: { employeeCode: input.employeeCode, isActive: true },
      select: { id: true },
    });
    return user?.id ?? null;
  }
  return null;
}
