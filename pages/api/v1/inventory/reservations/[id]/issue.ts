import { withApi } from "@/server/middleware/authenticate";
import { issueConsumableReservation } from "@/server/services/inventory.service";
import { recomputeFulfilment } from "@/server/services/request.service";
import { queryOne, withTransaction } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { ok } from "@/lib/api-response";
import { parseId } from "@/lib/validation";

export default withApi({
  POST: {
    permission: "asset.assign",
    handler: async (req, res, { user, correlationId }) => {
      const id = parseId(req.query.id);
      await withTransaction(async (tx) => {
        const r = await issueConsumableReservation(tx, user, id, correlationId);
        const item = await queryOne<{ hardwareRequestId: number }>(
          tx,
          `SELECT hardware_request_id AS hardwareRequestId FROM dbo.hardware_request_items WHERE id = @id`,
          { id: r.requestItemId }
        );
        if (!item) throw notFound("Request item");
        await recomputeFulfilment(tx, item.hardwareRequestId, user.id);
      });
      ok(res, null, "Stock issued");
    },
  },
});
