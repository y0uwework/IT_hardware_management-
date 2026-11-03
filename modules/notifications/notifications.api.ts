// notifications module — API route handlers. Each pages/api/v1/... route file re-exports one of these.
import { withApi } from "../../middlewares/authenticate";
import { listNotifications, markRead } from "./notifications.service";
import { ok } from "../../shared/api-response";
import { parse } from "../../shared/validation";
import { markReadSchema } from "./notifications.validation";

// /api/v1/notifications
export const notificationsHandler = withApi({
  GET: { handler: async (_req, res, { user }) => ok(res, await listNotifications(user.id)) },
  POST: {
    handler: async (req, res, { user }) => {
      const { id } = parse(markReadSchema, req.body);
      await markRead(user.id, id);
      ok(res, null, "Marked as read");
    },
  },
});
