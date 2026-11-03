import { withApi } from "@/server/middleware/authenticate";
import { availability } from "@/server/services/inventory.service";
import { ok } from "@/lib/api-response";
import { parseId } from "@/lib/validation";

export default withApi({
  GET: {
    permission: ["inventory.view", "request.it_review"],
    handler: async (req, res) => ok(res, await availability(parseId(req.query.categoryId, "categoryId")), "Availability"),
  },
});
