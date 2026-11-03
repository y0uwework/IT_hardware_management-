import { withApi } from "@/server/middleware/authenticate";
import { createTicket, listTickets } from "@/server/services/maintenance.service";
import { ticketCreateSchema, ticketListSchema } from "@/server/validators/maintenance.validators";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

export default withApi({
  GET: {
    permission: ["maintenance.report", "maintenance.manage"],
    handler: async (req, res, { user }) => {
      const q = parse(ticketListSchema, req.query);
      const { items, total } = await listTickets(user, q);
      ok(res, items, "Tickets", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: ["maintenance.report", "maintenance.manage"],
    handler: async (req, res, { user, correlationId }) => {
      const r = await createTicket(user, parse(ticketCreateSchema, req.body), correlationId);
      created(res, r, `${r.ticketNumber} raised${r.isRepeat ? " (repeat issue on this asset)" : ""}`);
    },
  },
});
