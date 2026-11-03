import type { GetServerSideProps, GetServerSidePropsContext } from "next";
import type { PermissionKey } from "../config/permissions.config";
import { getAuthUser, type AuthUser } from "./auth";

export interface ProtectedPageProps {
  user: AuthUser;
  forbidden?: boolean;
}

/**
 * Protects a page on the server: redirects to /login without a session and renders a
 * 403 state when the user lacks every listed permission. APIs re-check independently.
 */
export function withPageAuth(permission?: PermissionKey | PermissionKey[]): GetServerSideProps<ProtectedPageProps> {
  return async (ctx: GetServerSidePropsContext) => {
    const user = await getAuthUser(ctx.req);
    if (!user) {
      return { redirect: { destination: `/login?next=${encodeURIComponent(ctx.resolvedUrl)}`, permanent: false } };
    }
    const required = permission ? (Array.isArray(permission) ? permission : [permission]) : [];
    const allowed = required.length === 0 || required.some((p) => user.permissions.includes(p));
    if (!allowed) ctx.res.statusCode = 403;
    return { props: { user, ...(allowed ? {} : { forbidden: true }) } };
  };
}
