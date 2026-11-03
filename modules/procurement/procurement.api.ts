// procurement module — API route handlers. Each pages/api/v1/... route file re-exports one of these.
import { withApi } from "../../middlewares/authenticate";
import { actOnPurchaseOrder, cancelRequisition, createPo, createPoFromQuotation, createQuotation, createRequisition, getPurchaseOrder, getRequisition, listGoodsReceipts, listPurchaseOrders, listQuotations, listRequisitions, listVendors, pendingProcurementLines, receiveGoods, saveVendor, selectQuotation, vendorOptions } from "./procurement.service";
import { goodsReceiptSchema, poActionSchema, poCreateSchema, poFromQuotationSchema, poListSchema, quotationSchema, requisitionSchema, selectQuotationSchema, vendorSchema } from "./procurement.validation";
import { created, ok } from "../../shared/api-response";
import { commentSchema, listQuery, parse, parseId, reasonSchema } from "../../shared/validation";

// /api/v1/goods-receipts
export const goodsReceiptsHandler = withApi({
  GET: {
    permission: ["procurement.manage", "procurement.receive"],
    handler: async (req, res) => {
      const q = parse(listQuery, req.query);
      const { items, total } = await listGoodsReceipts(q);
      ok(res, items, "Goods receipts", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "procurement.receive",
    handler: async (req, res, { user, correlationId }) => {
      const r = await receiveGoods(user, parse(goodsReceiptSchema, req.body), correlationId);
      const assets = r.assetTags.length ? ` · ${r.assetTags.length} asset(s) registered` : "";
      created(res, r, `${r.grnNumber} recorded${assets}`);
    },
  },
});

// /api/v1/purchase-orders/[id]/[action]
export const purchaseOrdersByIdActionHandler = withApi({
  // Finer checks (which permission per action, approver ≠ creator) live in the service.
  POST: {
    permission: ["procurement.manage", "procurement.po.approve"],
    handler: async (req, res, { user, correlationId }) => {
      const a = parse(poActionSchema, req.query.action);
      const { comments } = parse(commentSchema, req.body);
      ok(res, await actOnPurchaseOrder(user, parseId(req.query.id), a, comments, correlationId), "Purchase order updated");
    },
  },
});

// /api/v1/purchase-orders/[id]
export const purchaseOrdersByIdHandler = withApi({
  GET: {
    permission: ["procurement.manage", "procurement.po.approve", "procurement.receive", "finance.invoice.verify", "finance.invoice.approve"],
    handler: async (req, res) => ok(res, await getPurchaseOrder(parseId(req.query.id)), "Purchase order"),
  },
});

// /api/v1/purchase-orders/from-quotation
export const purchaseOrdersFromQuotationHandler = withApi({
  POST: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await createPoFromQuotation(user, parse(poFromQuotationSchema, req.body), correlationId), "Purchase order created"),
  },
});

// /api/v1/purchase-orders
export const purchaseOrdersHandler = withApi({
  GET: {
    permission: ["procurement.manage", "procurement.po.approve", "procurement.receive", "finance.invoice.verify"],
    handler: async (req, res) => {
      const q = parse(poListSchema, req.query);
      const { items, total } = await listPurchaseOrders(q);
      ok(res, items, "Purchase orders", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await createPo(user, parse(poCreateSchema, req.body), correlationId), "Purchase order created"),
  },
});

// /api/v1/purchase-requisitions/[id]/cancel
export const purchaseRequisitionsByIdCancelHandler = withApi({
  POST: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await cancelRequisition(user, parseId(req.query.id), parse(reasonSchema, req.body).reason, correlationId), "Requisition cancelled"),
  },
});

// /api/v1/purchase-requisitions/[id]
export const purchaseRequisitionsByIdHandler = withApi({
  GET: { permission: "procurement.manage", handler: async (req, res) => ok(res, await getRequisition(parseId(req.query.id)), "Requisition") },
});

// /api/v1/purchase-requisitions
export const purchaseRequisitionsHandler = withApi({
  GET: {
    permission: "procurement.manage",
    handler: async (req, res) => {
      const q = parse(listQuery, req.query);
      const { items, total } = await listRequisitions(q);
      ok(res, items, "Requisitions", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await createRequisition(user, parse(requisitionSchema, req.body), correlationId), "Requisition created"),
  },
});

// /api/v1/purchase-requisitions/pending-lines
export const purchaseRequisitionsPendingLinesHandler = withApi({
  // Request lines IT marked "to procure" that are not yet on a requisition.
  GET: { permission: "procurement.manage", handler: async (_req, res) => ok(res, await pendingProcurementLines(), "Pending lines") },
});

// /api/v1/quotations/[id]/select
export const quotationsByIdSelectHandler = withApi({
  POST: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await selectQuotation(user, parseId(req.query.id), parse(selectQuotationSchema, req.body).reason, correlationId), "Vendor selected"),
  },
});

// /api/v1/quotations
export const quotationsHandler = withApi({
  GET: {
    permission: "procurement.manage",
    handler: async (req, res) => {
      const q = parse(listQuery, req.query);
      const { items, total } = await listQuotations(q);
      ok(res, items, "Quotations", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await createQuotation(user, parse(quotationSchema, req.body), correlationId), "Quotation recorded"),
  },
});

// /api/v1/vendors/[id]
export const vendorsByIdHandler = withApi({
  PUT: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await saveVendor(user, parseId(req.query.id), parse(vendorSchema, req.body), correlationId), "Vendor updated"),
  },
});

// /api/v1/vendors
export const vendorsHandler = withApi({
  GET: {
    permission: "procurement.manage",
    handler: async (req, res) => {
      const q = parse(listQuery, req.query);
      const { items, total } = await listVendors(q);
      ok(res, items, "Vendors", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await saveVendor(user, null, parse(vendorSchema, req.body), correlationId), "Vendor created"),
  },
});

// /api/v1/vendors/options
export const vendorsOptionsHandler = withApi({
  GET: {
    permission: ["procurement.manage", "finance.invoice.verify", "maintenance.manage", "reports.view"],
    handler: async (_req, res) => ok(res, await vendorOptions(), "Vendor options"),
  },
});
