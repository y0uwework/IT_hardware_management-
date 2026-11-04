// assets module — API route handlers. Each pages/api/v1/... route file re-exports one of these.
import { withApi } from "../../middlewares/authenticate";
import { acknowledgeAssignment, assignAsset, getAsset, listAssets, myAssets, registerAsset, returnAsset, transferAsset, updateAsset } from "./assets.service";
import { assetCreateSchema, assetListSchema, assetUpdateSchema, assignSchema, returnSchema, transferSchema } from "./assets.validation";
import { created, ok } from "../../shared/api-response";
import { parse, parseId } from "../../shared/validation";

// /api/v1/assets/[id]/assign
export const assetsByIdAssignHandler = withApi({
  POST: {
    permission: "asset.assign",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await assignAsset(user, parseId(req.query.id), parse(assignSchema, req.body), correlationId), "Asset assigned"),
  },
});

// /api/v1/assets/[id]
export const assetsByIdHandler = withApi({
  GET: {
    permission: ["asset.view", "asset.view.all"],
    handler: async (req, res, { user }) => ok(res, await getAsset(user, parseId(req.query.id)), "Asset"),
  },
  PUT: {
    permission: "asset.create",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await updateAsset(user, parseId(req.query.id), parse(assetUpdateSchema, req.body), correlationId), "Asset updated"),
  },
});

// /api/v1/assets/[id]/return
export const assetsByIdReturnHandler = withApi({
  POST: {
    permission: "asset.return",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await returnAsset(user, parseId(req.query.id), parse(returnSchema, req.body), correlationId), "Return processed"),
  },
});

// /api/v1/assets
export const assetsHandler = withApi({
  GET: {
    permission: ["asset.view.all", "asset.assign", "request.it_review"],
    handler: async (req, res) => {
      const q = parse(assetListSchema, req.query);
      const { items, total } = await listAssets(q);
      ok(res, items, "Assets", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "asset.create",
    handler: async (req, res, { user, correlationId }) => {
      created(res, await registerAsset(user, parse(assetCreateSchema, req.body), correlationId), "Asset registered");
    },
  },
});

// /api/v1/assets/mine
export const assetsMineHandler = withApi({
  GET: { permission: "asset.view", handler: async (_req, res, { user }) => ok(res, await myAssets(user), "My assets") },
});

// /api/v1/assignments/[id]/acknowledge
export const assignmentsByIdAcknowledgeHandler = withApi({
  POST: {
    permission: "asset.view",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await acknowledgeAssignment(user, parseId(req.query.id), correlationId), "Receipt acknowledged"),
  },
});

// /api/v1/assets/[id]/transfer
export const assetsByIdTransferHandler = withApi({
  POST: {
    permission: "inventory.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await transferAsset(user, parseId(req.query.id), parse(transferSchema, req.body), correlationId), "Asset transferred"),
  },
});
