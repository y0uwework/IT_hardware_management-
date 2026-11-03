import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { releaseReservation } from "@/server/services/inventory.service";
import { recomputeFulfilment } from "@/server/services/request.service";
import { queryOne, withTransaction } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

const schema = z.object({ reason: z.string().trim().min(3, "A reason is required").max(500) });

export default withApi({
  POST: {
    permission: ["inventory.manage", "request.it_review"],
    handler: async (req, res, { user, correlationId }) => {
      const { reason } = parse(schema, req.body);
      const id = parseId(req.query.id);
      await withTransaction(async (tx) => {
        const r = await releaseReservation(tx, user, id, reason, correlationId);
        const item = await queryOne<{ hardwareRequestId: number }>(
          tx,
          `SELECT hardware_request_id AS hardwareRequestId FROM dbo.hardware_request_items WHERE id = @id`,
          { id: r.requestItemId }
        );
        if (!item) throw notFound("Request item");
        await recomputeFulfilment(tx, item.hardwareRequestId, user.id);
      });
      ok(res, null, "Reservation released");
    },
  },
});
