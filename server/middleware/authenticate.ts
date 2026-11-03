import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import type { PermissionKey } from "../../config/permissions.config";
import { getAuthUser, type AuthUser } from "../../lib/auth";
import { AppError } from "../../lib/errors";
import { fail } from "../../lib/api-response";
import { logger } from "../../lib/logger";
import { requireAnyPermission } from "./authorize";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiContext {
  user: AuthUser;
  correlationId: string;
}

export interface RouteDef {
  /** Caller needs at least one of these. Omit only for routes any signed-in user may call. */
  permission?: PermissionKey | PermissionKey[];
  handler: (req: NextApiRequest, res: NextApiResponse, ctx: ApiContext) => Promise<void>;
}

export interface PublicRouteDef {
  handler: (req: NextApiRequest, res: NextApiResponse, ctx: { correlationId: string }) => Promise<void>;
}

/** Rejects cross-site state-changing requests (CSRF defence alongside SameSite=Lax cookies). */
function assertSameOrigin(req: NextApiRequest) {
  const method = req.method ?? "GET";
  if (method === "GET" || method === "HEAD") return;

  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new AppError("VALIDATION_ERROR", "Requests must be sent as application/json");
  }
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new AppError("FORBIDDEN", "Invalid request origin");
    }
    if (originHost !== host) throw new AppError("FORBIDDEN", "Cross-origin request rejected");
  }
}

function toAppError(error: unknown, correlationId: string): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return new AppError("CONFLICT", "A record with the same unique value already exists");
    if (error.code === "P2025") return new AppError("NOT_FOUND", "Record not found");
  }
  logger.error("Unhandled API error", {
    correlationId,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
  });
  return new AppError("INTERNAL_ERROR", `Something went wrong. Reference: ${correlationId}`);
}

/**
 * Wraps an API route: method dispatch, authentication, permission check,
 * CSRF check and consistent error responses. Record-level checks stay in services.
 */
export function withApi(routes: Partial<Record<Method, RouteDef>>) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    const correlationId = randomUUID();
    res.setHeader("X-Correlation-Id", correlationId);
    res.setHeader("Cache-Control", "no-store");
    try {
      const route = routes[(req.method ?? "GET") as Method];
      if (!route) {
        res.setHeader("Allow", Object.keys(routes).join(", "));
        throw new AppError("METHOD_NOT_ALLOWED", "Method not allowed");
      }
      assertSameOrigin(req);
      const user = await getAuthUser(req);
      if (!user) throw new AppError("UNAUTHENTICATED", "Authentication required");
      if (route.permission) {
        requireAnyPermission(user, Array.isArray(route.permission) ? route.permission : [route.permission]);
      }
      await route.handler(req, res, { user, correlationId });
    } catch (error) {
      fail(res, toAppError(error, correlationId));
    }
  };
}

/** For the few endpoints that must work without a session (sign-in). */
export function withPublicApi(routes: Partial<Record<Method, PublicRouteDef>>) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    const correlationId = randomUUID();
    res.setHeader("Cache-Control", "no-store");
    try {
      const route = routes[(req.method ?? "GET") as Method];
      if (!route) throw new AppError("METHOD_NOT_ALLOWED", "Method not allowed");
      assertSameOrigin(req);
      await route.handler(req, res, { correlationId });
    } catch (error) {
      fail(res, toAppError(error, correlationId));
    }
  };
}
