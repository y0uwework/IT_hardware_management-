// requests module — API route handlers. Each pages/api/v1/... route file re-exports one of these.
import { withApi } from "../../middlewares/authenticate";
import { cancelRequest, createRequest, getRequest, listRequests, saveItReview, submitRequest, updateRequest } from "./requests.service";
import { cancelRequestSchema, itReviewSchema, requestInputSchema, requestListSchema } from "./requests.validation";
import { created, ok } from "../../shared/api-response";
import { parse, parseId } from "../../shared/validation";

// /api/v1/hardware-requests/[id]/cancel
export const hardwareRequestsByIdCancelHandler = withApi({
  POST: {
    permission: "request.create",
    handler: async (req, res, { user, correlationId }) => {
      const { reason } = parse(cancelRequestSchema, req.body ?? {});
      ok(res, await cancelRequest(user, parseId(req.query.id), reason, correlationId), "Request cancelled");
    },
  },
});

// /api/v1/hardware-requests/[id]/history
export const hardwareRequestsByIdHistoryHandler = withApi({
  GET: {
    permission: "request.view",
    handler: async (req, res, { user }) => {
      const request = await getRequest(user, parseId(req.query.id));
      ok(res, request.history, "Request history");
    },
  },
});

// /api/v1/hardware-requests/[id]
export const hardwareRequestsByIdHandler = withApi({
  GET: {
    permission: "request.view",
    handler: async (req, res, { user }) =>
      ok(res, await getRequest(user, parseId(req.query.id)), "Request retrieved successfully"),
  },
  PUT: {
    permission: "request.create",
    handler: async (req, res, { user, correlationId }) => {
      const input = parse(requestInputSchema, req.body);
      const result = await updateRequest(user, parseId(req.query.id), input, correlationId);
      ok(res, result, input.submit ? "Request submitted" : "Draft saved");
    },
  },
});

// /api/v1/hardware-requests/[id]/it-review
export const hardwareRequestsByIdItReviewHandler = withApi({
  POST: {
    permission: "request.it_review",
    handler: async (req, res, { user, correlationId }) => {
      const input = parse(itReviewSchema, req.body);
      ok(res, await saveItReview(user, parseId(req.query.id), input, correlationId), "IT review saved");
    },
  },
});

// /api/v1/hardware-requests/[id]/submit
export const hardwareRequestsByIdSubmitHandler = withApi({
  POST: {
    permission: "request.create",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await submitRequest(user, parseId(req.query.id), correlationId), "Request submitted"),
  },
});

// /api/v1/hardware-requests
export const hardwareRequestsHandler = withApi({
  GET: {
    permission: "request.view",
    handler: async (req, res, { user }) => {
      const q = parse(requestListSchema, req.query);
      const { items, total } = await listRequests(user, q);
      ok(res, items, "Requests", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "request.create",
    handler: async (req, res, { user, correlationId }) => {
      const input = parse(requestInputSchema, req.body);
      const result = await createRequest(user, input, correlationId);
      created(res, result, input.submit ? "Request submitted" : "Draft saved");
    },
  },
});
