import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { cancelRequest } from "@/server/services/request.service";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

const schema = z.object({ reason: z.string().trim().max(1000).optional() });

export default withApi({
  POST: {
    permission: "request.create",
    handler: async (req, res, { user, correlationId }) => {
      const { reason } = parse(schema, req.body ?? {});
      ok(res, await cancelRequest(user, parseId(req.query.id), reason, correlationId), "Request cancelled");
    },
  },
});
