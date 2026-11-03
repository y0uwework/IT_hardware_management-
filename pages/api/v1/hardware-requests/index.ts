import { withApi } from "@/server/middleware/authenticate";
import { createRequest, listRequests } from "@/server/services/request.service";
import { requestInputSchema, requestListSchema } from "@/server/validators/request.validators";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

export default withApi({
  GET: {
    permission: "request.view",
    handler: async (req, res, { user }) => {
      const q = parse(requestListSchema, req.query);
      const { items, total } = await listRequests(user, q);
      ok(res, items, "Requests", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "request.create",
    handler: async (req, res, { user, correlationId }) => {
      const input = parse(requestInputSchema, req.body);
      const result = await createRequest(user, input, correlationId);
      created(res, result, input.submit ? "Request submitted" : "Draft saved");
    },
  },
});
