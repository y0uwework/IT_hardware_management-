import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { listNotifications, markRead } from "@/server/services/notification.service";
import { ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

const markSchema = z.object({ id: z.union([z.literal("all"), z.coerce.number().int().positive()]) });

export default withApi({
  GET: { handler: async (_req, res, { user }) => ok(res, await listNotifications(user.id)) },
  POST: {
    handler: async (req, res, { user }) => {
      const { id } = parse(markSchema, req.body);
      await markRead(user.id, id);
      ok(res, null, "Marked as read");
    },
  },
});
