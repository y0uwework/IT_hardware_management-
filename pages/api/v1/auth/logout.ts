import { withPublicApi } from "@/server/middleware/authenticate";
import { clearSessionCookie } from "@/lib/session";
import { ok } from "@/lib/api-response";

export default withPublicApi({
  POST: {
    handler: async (_req, res) => {
      clearSessionCookie(res);
      ok(res, null, "Signed out");
    },
  },
});
