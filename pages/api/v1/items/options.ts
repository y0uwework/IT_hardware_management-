import { withApi } from "@/server/middleware/authenticate";
import { listItemOptions } from "@/server/services/item.service";
import { ok } from "@/lib/api-response";

export default withApi({
  // Pick list of active items: anyone building a request needs it.
  GET: {
    permission: ["request.create", "item.view"],
    handler: async (_req, res) => ok(res, await listItemOptions(), "Item options"),
  },
});
