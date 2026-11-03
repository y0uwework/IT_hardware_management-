import { withApi } from "@/server/middleware/authenticate";
import { bulkCreateItems } from "@/server/services/item.service";
import { itemBulkSchema } from "@/server/validators/item.validators";
import { ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

// Up to appConfig.itemBulkUploadMaxRows rows of parsed CSV.
export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

export default withApi({
  POST: {
    permission: "item.bulk_upload",
    handler: async (req, res, { user, correlationId }) => {
      const { rows } = parse(itemBulkSchema, req.body);
      const result = await bulkCreateItems(user, rows, correlationId);
      ok(res, result, `${result.created} item(s) created, ${result.exists} already existed, ${result.failed} failed`);
    },
  },
});
