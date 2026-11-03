import { withApi } from "@/server/middleware/authenticate";
import { listTechnicians } from "@/server/services/maintenance.service";
import { ok } from "@/lib/api-response";

export default withApi({
  GET: { permission: "maintenance.manage", handler: async (_req, res) => ok(res, await listTechnicians(), "Technicians") },
});
