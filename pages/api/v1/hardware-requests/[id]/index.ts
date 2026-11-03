import { withApi } from "@/server/middleware/authenticate";
import { getRequest, updateRequest } from "@/server/services/request.service";
import { requestInputSchema } from "@/server/validators/request.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  GET: {
    permission: "request.view",
    handler: async (req, res, { user }) =>
      ok(res, await getRequest(user, parseId(req.query.id)), "Request retrieved successfully"),
  },
  PUT: {
    permission: "request.create",
    handler: async (req, res, { user, correlationId }) => {
      const input = parse(requestInputSchema, req.body);
      const result = await updateRequest(user, parseId(req.query.id), input, correlationId);
      ok(res, result, input.submit ? "Request submitted" : "Draft saved");
    },
  },
});
