import type { IncomingMessage } from "http";
import { prisma } from "./prisma";
import { getSessionCookie, readSessionToken } from "./session";

/**
 * The authenticated actor, as seen by every API route and protected page.
 * `permissions` are the effective permission keys from all of the user's active roles.
 */
export interface AuthUser {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string | null;
  department: string | null;
  designation: string | null;
  managerId: number | null;
  roles: string[];
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
      userRoles: {
        where: { role: { isActive: true } },
        select: {
          role: {
            select: {
              roleName: true,
              rolePermissions: { select: { permission: { select: { permissionKey: true } } } },
            },
          },
        },
      },
    },
  });
  if (!user || !user.isActive) return null;

  const roles = user.userRoles.map((ur) => ur.role.roleName);
  const permissions = Array.from(
    new Set(user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.permissionKey)))
  ).sort();

  return {
    id: user.id,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    email: user.email,
    department: user.department,
    designation: user.designation,
    managerId: user.managerId,
    roles,
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
