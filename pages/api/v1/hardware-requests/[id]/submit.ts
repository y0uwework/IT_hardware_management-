import { withApi } from "@/server/middleware/authenticate";
import { submitRequest } from "@/server/services/request.service";
import { ok } from "@/lib/api-response";
import { parseId } from "@/lib/validation";

export default withApi({
  POST: {
    permission: "request.create",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await submitRequest(user, parseId(req.query.id), correlationId), "Request submitted"),
  },
});
