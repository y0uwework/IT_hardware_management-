import { withApi } from "@/server/middleware/authenticate";
import { getRequest } from "@/server/services/request.service";
import { ok } from "@/lib/api-response";
import { parseId } from "@/lib/validation";

export default withApi({
  GET: {
    permission: "request.view",
    handler: async (req, res, { user }) => {
      const request = await getRequest(user, parseId(req.query.id));
      ok(res, request.history, "Request history");
    },
  },
});
