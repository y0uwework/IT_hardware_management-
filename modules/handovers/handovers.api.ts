// handovers module — API route handlers. Each pages/api/v1/... route file re-exports one of these.
import { withApi } from "../../middlewares/authenticate";
import { ok } from "../../shared/api-response";
import { AppError } from "../../shared/errors";
import { parseId } from "../../shared/validation";
import { acknowledgeHandover, listMyHandovers } from "./handovers.service";
import { isHandoverKind } from "./handovers.types";

// /api/v1/handovers/mine — everything issued to the signed-in user (assets + issued stock)
export const handoversMineHandler = withApi({
  GET: { permission: "asset.view", handler: async (_req, res, { user }) => ok(res, await listMyHandovers(user), "My handovers") },
});

// /api/v1/handovers/[kind]/[id]/acknowledge — the recipient confirms receipt
export const handoversAcknowledgeHandler = withApi({
  POST: {
    permission: ["asset.view", "request.view"],
    handler: async (req, res, { user, correlationId }) => {
      const kind = Array.isArray(req.query.kind) ? req.query.kind[0] : req.query.kind;
      if (!isHandoverKind(kind)) throw new AppError("VALIDATION_ERROR", "Unknown handover kind");
      ok(res, await acknowledgeHandover(user, kind, parseId(req.query.id), correlationId), "Receipt acknowledged");
    },
  },
});
