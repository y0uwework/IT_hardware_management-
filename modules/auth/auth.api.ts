// auth module — API route handlers. Each pages/api/v1/... route file re-exports one of these.
import { withApi, withPublicApi } from "../../middlewares/authenticate";
import { ok } from "../../shared/api-response";
import { authMode, loadAuthUser, verifyCredentials } from "../../shared/auth";
import { AppError } from "../../shared/errors";
import { clearSessionCookie, createSessionToken, setSessionCookie } from "../../shared/session";
import { parse } from "../../shared/validation";
import { loginSchema } from "./auth.validation";

// /api/v1/auth/login
export const authLoginHandler = withPublicApi({
  POST: {
    handler: async (req, res) => {
      const input = parse(loginSchema, req.body);
      if (authMode() !== "dev") {
        throw new AppError(
          "NOT_IMPLEMENTED",
          "Sign-in is handled by the organization's existing authentication. Integrate it in shared/auth.ts."
        );
      }
      const userId = await verifyCredentials(input);
      if (!userId) throw new AppError("UNAUTHENTICATED", "Sign-in failed. Check your employee code.");
      const user = await loadAuthUser(userId);
      if (!user) throw new AppError("UNAUTHENTICATED", "Your account is inactive.");
      setSessionCookie(res, await createSessionToken({ userId }));
      ok(res, { id: user.id, fullName: user.fullName }, "Signed in");
    },
  },
});

// /api/v1/auth/logout
export const authLogoutHandler = withPublicApi({
  POST: {
    handler: async (_req, res) => {
      clearSessionCookie(res);
      ok(res, null, "Signed out");
    },
  },
});

// /api/v1/me
export const meHandler = withApi({
  GET: { handler: async (_req, res, { user }) => ok(res, user, "Current user") },
});
