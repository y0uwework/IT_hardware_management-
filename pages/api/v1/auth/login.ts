import { z } from "zod";
import { withPublicApi } from "@/server/middleware/authenticate";
import { authMode, loadAuthUser, verifyCredentials } from "@/lib/auth";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { parse } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { ok } from "@/lib/api-response";

const schema = z.object({
  employeeCode: z.string().trim().min(1, "Employee code is required").max(50),
  password: z.string().max(200).optional(),
});

export default withPublicApi({
  POST: {
    handler: async (req, res) => {
      const input = parse(schema, req.body);
      if (authMode() !== "dev") {
        throw new AppError(
          "NOT_IMPLEMENTED",
          "Sign-in is handled by the organization's existing authentication. Integrate it in lib/auth.ts."
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
