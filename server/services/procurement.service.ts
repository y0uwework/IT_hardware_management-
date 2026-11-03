// Procurement: vendors → purchase requisitions → quotations → purchase orders → goods receipts.
// Goods received against a PO line that came from an employee request are reserved straight
// back to that request item, so IT can hand them over without another review.

import { Where, execute, getPool, likeContains, query, queryMany, queryOne, withTransaction, type Params, type Tx } from "../../lib/db";
import { AppError, conflict, forbidden, notFound } from "../../lib/errors";
import type { AuthUser } from "../../lib/auth";
import { appConfig } from "../../config/app.config";
import {
  PO_STATUS,
  PO_TRANSITIONS,
  PR_STATUS,
  QUOTATION_STATUS,
  REQUEST_STATUS,
  canTransition,
  type PoStatus,
} from "../../config/status.config";
import { audit } from "../utils/audit";
import { assignNumber, tmpNumber } from "../utils/numbering";
import { skipTake } from "../../lib/validation";
import { userHas } from "../middleware/authorize";
import { documentTotals, lineAmounts, money, parseSerials, poStatusAfterReceipt } from "./procurement-rules";
import { registerAssetInTx } from "./asset.service";
import { moveStock, recordMovementRow, reserveForItem } from "./inventory.service";
import { recomputeFulfilment } from "./request.service";
import { notify, NOTIFICATION_EVENT } from "./notification.service";
import type {
  GoodsReceiptInput,
  ListQuery,
  PoCreateInput,
  QuotationInput,
  RequisitionInput,
  VendorInput,
} from "../validators/procurement.validators";

const P = appConfig.numberPrefixes;
const FULFILMENT_PHASE = [REQUEST_STATUS.UNDER_IT_REVIEW, REQUEST_STATUS.AWAITING_PROCUREMENT, REQUEST_STATUS.PARTIALLY_FULFILLED];
const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);

async function paged<T>(tx: Tx, select: string, from: string, where: Where, orderBy: string, q: ListQuery) {
  const [items, total] = await Promise.all([
    query<T>(tx, `${select} ${from} ${where} ORDER BY ${orderBy} OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`, {
      ...where.params,
      ...skipTake(q),
    }),
    queryOne<{ total: number }>(tx, `SELECT COUNT(*) AS total ${from} ${where}`, where.params),
  ]);
  return { items, total: total?.total ?? 0 };
}

// ══ Vendors ══════════════════════════════════════════════════════════════════

const VENDOR_COLS = `v.id, v.code, v.name, v.gstin, v.pan, v.contact_person AS contactPerson, v.email, v.phone, v.address,
  v.city, v.state, v.pincode, v.payment_terms_days AS paymentTermsDays, v.bank_details AS bankDetails, v.notes,
  v.is_active AS isActive, v.created_at AS createdAt`;

const VENDOR_FIELDS: Record<keyof VendorInput, string> = {
  code: "code",
  name: "name",
  gstin: "gstin",
  pan: "pan",
  contactPerson: "contact_person",
  email: "email",
  phone: "phone",
  address: "address",
  city: "city",
  state: "state",
  pincode: "pincode",
  paymentTermsDays: "payment_terms_days",
  bankDetails: "bank_details",
  notes: "notes",
  isActive: "is_active",
};

export async function listVendors(q: ListQuery) {
  const where = new Where();
  if (q.search) where.add("(v.code LIKE @s OR v.name LIKE @s OR v.gstin LIKE @s OR v.city LIKE @s)", { s: likeContains(q.search) });
  if (q.status === "active") where.add("v.is_active = 1");
  if (q.status === "inactive") where.add("v.is_active = 0");
  return paged(
    await getPool(),
    `SELECT ${VENDOR_COLS},
       (SELECT COUNT(*) FROM dbo.purchase_orders po WHERE po.vendor_id = v.id AND po.status <> @cancelled) AS poCount`,
    `FROM dbo.vendors v`,
    where.add("1 = 1", { cancelled: PO_STATUS.CANCELLED }),
    "v.name, v.id",
    q
  );
}

export async function vendorOptions() {
  return query(await getPool(), `SELECT v.id, v.code, v.name FROM dbo.vendors v WHERE v.is_active = 1 ORDER BY v.name`);
}

export async function saveVendor(actor: AuthUser, vendorId: number | null, input: VendorInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    const load = (vid: number) => queryOne(tx, `SELECT ${VENDOR_COLS} FROM dbo.vendors v WHERE v.id = @id`, { id: vid });
    const before = vendorId ? await load(vendorId) : null;
    if (vendorId && !before) throw notFound("Vendor");
    const dup = await queryOne<{ id: number }>(tx, `SELECT id FROM dbo.vendors WHERE code = @code AND id <> @id`, {
      code: input.code,
      id: vendorId ?? 0,
    });
    if (dup) throw new AppError("VALIDATION_ERROR", "Vendor code already exists", [{ path: "code", message: "Vendor code already exists" }]);
    if (input.gstin) {
      const g = await queryOne<{ name: string }>(tx, `SELECT name FROM dbo.vendors WHERE gstin = @gstin AND id <> @id`, {
        gstin: input.gstin,
        id: vendorId ?? 0,
      });
      if (g) throw new AppError("VALIDATION_ERROR", "GSTIN already used", [{ path: "gstin", message: `Already used by ${g.name}` }]);
    }
    const fields = Object.keys(VENDOR_FIELDS) as (keyof VendorInput)[];
    const params: Params = { actor: actor.id };
    for (const f of fields) params[f] = input[f];
    let rowId = vendorId;
    if (vendorId) {
      await execute(
        tx,
        `UPDATE dbo.vendors SET ${fields.map((f) => `${VENDOR_FIELDS[f]} = @${f}`).join(", ")}, updated_at = SYSUTCDATETIME() WHERE id = @id`,
        { ...params, id: vendorId }
      );
    } else {
      rowId = (await queryOne<{ id: number }>(
        tx,
        `INSERT INTO dbo.vendors (${fields.map((f) => VENDOR_FIELDS[f]).join(", ")}, created_by_user_id)
         OUTPUT INSERTED.id VALUES (${fields.map((f) => `@${f}`).join(", ")}, @actor)`,
        params
      ))!.id;
    }
    const after = await load(rowId!);
    await audit(tx, {
      actorUserId: actor.id,
      action: vendorId ? "vendor.update" : "vendor.create",
      entityType: "vendor",
      entityId: rowId!,
      before,
      after,
      correlationId,
    });
    return after;
  });
}

// ══ Requisitions ═════════════════════════════════════════════════════════════

/**
 * Request lines IT marked for procurement that are not yet fully on a requisition.
 * outstanding = procurement_quantity + procured_received_quantity − quantity on live requisitions.
 */
const PENDING_LINES_SQL = `
  WITH lines AS (
    SELECT i.id AS requestItemId, r.id AS requestId, r.request_number AS requestNumber, r.cost_centre AS costCentre,
           u.full_name AS requesterName, u.department, i.category_id AS categoryId, c.name AS categoryName,
           i.item_id AS itemId, im.item_code AS itemCode, im.item_name AS itemName,
           COALESCE(i.approved_specification, i.requested_specification) AS specification,
           COALESCE(i.estimated_unit_price, im.standard_cost) AS estimatedUnitPrice,
           i.procurement_quantity + i.procured_received_quantity - COALESCE((
             SELECT SUM(pri.quantity) FROM dbo.purchase_requisition_items pri
             JOIN dbo.purchase_requisitions pr ON pr.id = pri.requisition_id
             WHERE pri.request_item_id = i.id AND pr.status <> @cancelled), 0) AS outstanding
    FROM dbo.hardware_request_items i
    JOIN dbo.hardware_requests r ON r.id = i.hardware_request_id
    JOIN dbo.users u ON u.id = r.requester_user_id
    JOIN dbo.hardware_categories c ON c.id = i.category_id
    LEFT JOIN dbo.item_master im ON im.id = i.item_id
    WHERE i.procurement_quantity > 0 AND r.status IN (@phase)
  )
  SELECT requestItemId, requestId, requestNumber, costCentre, requesterName, department, categoryId, categoryName,
         itemId, itemCode, itemName, specification, CONVERT(NVARCHAR(40), estimatedUnitPrice) AS estimatedUnitPrice, outstanding
  FROM lines WHERE outstanding > 0`;

export async function pendingProcurementLines(tx?: Tx, ids?: number[]) {
  const ex = tx ?? (await getPool());
  return query<{
    requestItemId: number;
    requestId: number;
    requestNumber: string;
    costCentre: string | null;
    requesterName: string;
    department: string | null;
    categoryId: number;
    categoryName: string;
    itemId: number | null;
    itemCode: string | null;
    itemName: string | null;
    specification: string;
    estimatedUnitPrice: string | null;
    outstanding: number;
  }>(ex, `${PENDING_LINES_SQL}${ids ? " AND requestItemId IN (@ids)" : ""} ORDER BY requestNumber, requestItemId`, {
    cancelled: PR_STATUS.CANCELLED,
    phase: FULFILMENT_PHASE,
    ...(ids ? { ids } : {}),
  });
}

export async function createRequisition(actor: AuthUser, input: RequisitionInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    const lines: { requestItemId: number | null; itemId: number | null; categoryId: number; description: string; quantity: number; estimatedUnitPrice: number | null }[] = [];

    if (input.requestItemIds.length) {
      const pending = await pendingProcurementLines(tx, input.requestItemIds);
      const missing = input.requestItemIds.filter((rid) => !pending.some((p) => p.requestItemId === rid));
      if (missing.length) throw conflict("Some request lines no longer need procurement — refresh and try again");
      for (const p of pending) {
        lines.push({
          requestItemId: p.requestItemId,
          itemId: p.itemId,
          categoryId: p.categoryId,
          description: `${p.itemName ?? p.categoryName} — ${p.specification}`.slice(0, 1000),
          quantity: p.outstanding,
          estimatedUnitPrice: p.estimatedUnitPrice ? Number(p.estimatedUnitPrice) : null,
        });
      }
      if (!input.department) {
        const depts = Array.from(new Set(pending.map((p) => p.department).filter(Boolean)));
        if (depts.length === 1) input.department = depts[0];
      }
      if (!input.costCentre) {
        const ccs = Array.from(new Set(pending.map((p) => p.costCentre).filter(Boolean)));
        if (ccs.length === 1) input.costCentre = ccs[0];
      }
    }

    if (input.lines.length) {
      const items = await query<{ id: number; categoryId: number; name: string; description: string | null; standardCost: string | null }>(
        tx,
        `SELECT im.id, im.category_id AS categoryId, im.item_name AS name, im.description,
                CONVERT(NVARCHAR(40), im.standard_cost) AS standardCost
         FROM dbo.item_master im WHERE im.id IN (@ids) AND im.is_deleted = 0 AND im.is_active = 1`,
        { ids: input.lines.map((l) => l.itemId) }
      );
      input.lines.forEach((l, i) => {
        const it = items.find((x) => x.id === l.itemId);
        if (!it) throw new AppError("VALIDATION_ERROR", "Item is not available", [{ path: `lines.${i}.itemId`, message: "Item is not available" }]);
        lines.push({
          requestItemId: null,
          itemId: it.id,
          categoryId: it.categoryId,
          description: l.description ?? (it.description ? `${it.name} — ${it.description}` : it.name).slice(0, 1000),
          quantity: l.quantity,
          estimatedUnitPrice: l.estimatedUnitPrice ?? (it.standardCost ? Number(it.standardCost) : null),
        });
      });
    }

    const pr = (await queryOne<{ id: number }>(
      tx,
      `INSERT INTO dbo.purchase_requisitions (pr_number, title, status, department, cost_centre, required_date, notes, created_by_user_id)
       OUTPUT INSERTED.id VALUES (@tmp, @title, @status, @department, @costCentre, @requiredDate, @notes, @actor)`,
      {
        tmp: tmpNumber(),
        title: input.title,
        status: PR_STATUS.OPEN,
        department: input.department,
        costCentre: input.costCentre,
        requiredDate: toDate(input.requiredDate),
        notes: input.notes,
        actor: actor.id,
      }
    ))!;
    const prNumber = await assignNumber(tx, "purchase_requisitions", "pr_number", P.requisition, pr.id);
    for (const l of lines) {
      await execute(
        tx,
        `INSERT INTO dbo.purchase_requisition_items (requisition_id, request_item_id, item_id, category_id, description, quantity, estimated_unit_price)
         VALUES (@prId, @requestItemId, @itemId, @categoryId, @description, @quantity, @estimatedUnitPrice)`,
        { prId: pr.id, ...l }
      );
    }
    await audit(tx, { actorUserId: actor.id, action: "requisition.create", entityType: "purchase_requisition", entityId: pr.id, after: { prNumber, ...input, lines }, correlationId });
    return { id: pr.id, prNumber };
  });
}

const PR_COLS = `pr.id, pr.pr_number AS prNumber, pr.title, pr.status, pr.department, pr.cost_centre AS costCentre,
  pr.required_date AS requiredDate, pr.notes, pr.created_at AS createdAt, cb.full_name AS [createdBy.fullName]`;

export async function listRequisitions(q: ListQuery) {
  const where = new Where();
  if (q.search) where.add("(pr.pr_number LIKE @s OR pr.title LIKE @s OR pr.department LIKE @s)", { s: likeContains(q.search) });
  if (q.status) where.add("pr.status = @status", { status: q.status });
  return paged(
    await getPool(),
    `SELECT ${PR_COLS},
       (SELECT COUNT(*) FROM dbo.purchase_requisition_items x WHERE x.requisition_id = pr.id) AS lineCount,
       (SELECT COUNT(*) FROM dbo.quotations q WHERE q.requisition_id = pr.id) AS quotationCount,
       (SELECT CONVERT(NVARCHAR(40), SUM(x.quantity * x.estimated_unit_price)) FROM dbo.purchase_requisition_items x WHERE x.requisition_id = pr.id) AS estimatedValue`,
    `FROM dbo.purchase_requisitions pr JOIN dbo.users cb ON cb.id = pr.created_by_user_id`,
    where,
    "pr.created_at DESC, pr.id DESC",
    q
  );
}

export async function getRequisition(prId: number) {
  const pool = await getPool();
  const [[header], items, quotations, quoteItems, orders] = await queryMany(
    pool,
    `SELECT ${PR_COLS} FROM dbo.purchase_requisitions pr JOIN dbo.users cb ON cb.id = pr.created_by_user_id WHERE pr.id = @id;

     SELECT x.id, x.request_item_id AS requestItemId, x.item_id AS itemId, x.description, x.quantity,
            CONVERT(NVARCHAR(40), x.estimated_unit_price) AS estimatedUnitPrice,
            c.name AS [category.name], im.item_code AS [item.code], im.item_name AS [item.name],
            r.id AS [request.id], r.request_number AS [request.requestNumber], u.full_name AS [request.requesterName]
     FROM dbo.purchase_requisition_items x
     JOIN dbo.hardware_categories c ON c.id = x.category_id
     LEFT JOIN dbo.item_master im ON im.id = x.item_id
     LEFT JOIN dbo.hardware_request_items ri ON ri.id = x.request_item_id
     LEFT JOIN dbo.hardware_requests r ON r.id = ri.hardware_request_id
     LEFT JOIN dbo.users u ON u.id = r.requester_user_id
     WHERE x.requisition_id = @id ORDER BY x.id;

     SELECT q.id, q.quotation_number AS quotationNumber, q.vendor_reference AS vendorReference, q.quote_date AS quoteDate,
            q.valid_until AS validUntil, q.delivery_days AS deliveryDays, q.payment_terms AS paymentTerms,
            CONVERT(NVARCHAR(40), q.subtotal) AS subtotal, CONVERT(NVARCHAR(40), q.tax_amount) AS taxAmount,
            CONVERT(NVARCHAR(40), q.total_amount) AS totalAmount, q.status, q.selection_reason AS selectionReason, q.notes,
            v.id AS [vendor.id], v.name AS [vendor.name], v.code AS [vendor.code]
     FROM dbo.quotations q JOIN dbo.vendors v ON v.id = q.vendor_id
     WHERE q.requisition_id = @id ORDER BY q.total_amount, q.id;

     SELECT qi.quotation_id AS quotationId, qi.requisition_item_id AS requisitionItemId, qi.quantity,
            CONVERT(NVARCHAR(40), qi.unit_price) AS unitPrice, CONVERT(NVARCHAR(40), qi.tax_rate) AS taxRate,
            CONVERT(NVARCHAR(40), qi.line_total) AS lineTotal, qi.remarks
     FROM dbo.quotation_items qi JOIN dbo.quotations q ON q.id = qi.quotation_id WHERE q.requisition_id = @id;

     SELECT po.id, po.po_number AS poNumber, po.status, CONVERT(NVARCHAR(40), po.total_amount) AS totalAmount, v.name AS vendorName
     FROM dbo.purchase_orders po JOIN dbo.vendors v ON v.id = po.vendor_id WHERE po.requisition_id = @id ORDER BY po.id;`,
    { id: prId }
  );
  if (!header) throw notFound("Requisition");
  return {
    ...header,
    items,
    quotations: quotations.map((q) => ({ ...q, items: quoteItems.filter((i) => i.quotationId === q.id) })),
    purchaseOrders: orders,
  };
}

export async function cancelRequisition(actor: AuthUser, prId: number, reason: string, correlationId?: string) {
  return withTransaction(async (tx) => {
    const pr = await queryOne<{ status: string }>(tx, `SELECT status FROM dbo.purchase_requisitions WHERE id = @id`, { id: prId });
    if (!pr) throw notFound("Requisition");
    if (![PR_STATUS.OPEN, PR_STATUS.QUOTATION].includes(pr.status as never)) throw conflict(`A requisition in "${pr.status}" cannot be cancelled`);
    await execute(tx, `UPDATE dbo.purchase_requisitions SET status = @s, notes = CONCAT(COALESCE(notes + CHAR(10), ''), @note), updated_at = SYSUTCDATETIME() WHERE id = @id`, {
      id: prId,
      s: PR_STATUS.CANCELLED,
      note: `Cancelled: ${reason}`,
    });
    await audit(tx, { actorUserId: actor.id, action: "requisition.cancel", entityType: "purchase_requisition", entityId: prId, before: pr, after: { status: PR_STATUS.CANCELLED, reason }, correlationId });
    return { id: prId };
  });
}

// ══ Quotations ═══════════════════════════════════════════════════════════════

export async function createQuotation(actor: AuthUser, input: QuotationInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    const pr = await queryOne<{ status: string }>(tx, `SELECT status FROM dbo.purchase_requisitions WITH (UPDLOCK) WHERE id = @id`, {
      id: input.requisitionId,
    });
    if (!pr) throw notFound("Requisition");
    if (![PR_STATUS.OPEN, PR_STATUS.QUOTATION].includes(pr.status as never)) throw conflict(`Quotations can't be added to a requisition in "${pr.status}"`);
    const vendor = await queryOne<{ isActive: boolean }>(tx, `SELECT is_active AS isActive FROM dbo.vendors WHERE id = @id`, { id: input.vendorId });
    if (!vendor?.isActive) throw new AppError("VALIDATION_ERROR", "Vendor is invalid or inactive", [{ path: "vendorId", message: "Choose an active vendor" }]);
    const prItems = await query<{ id: number }>(tx, `SELECT id FROM dbo.purchase_requisition_items WHERE requisition_id = @id`, { id: input.requisitionId });
    for (const l of input.lines) {
      if (!prItems.some((p) => p.id === l.requisitionItemId)) throw new AppError("VALIDATION_ERROR", "A quoted line is not on this requisition");
    }
    const totals = documentTotals(input.lines);
    const q = (await queryOne<{ id: number }>(
      tx,
      `INSERT INTO dbo.quotations (quotation_number, requisition_id, vendor_id, vendor_reference, quote_date, valid_until, delivery_days,
         payment_terms, subtotal, tax_amount, total_amount, status, notes, created_by_user_id)
       OUTPUT INSERTED.id
       VALUES (@tmp, @requisitionId, @vendorId, @vendorReference, @quoteDate, @validUntil, @deliveryDays, @paymentTerms,
         @subtotal, @taxAmount, @totalAmount, @status, @notes, @actor)`,
      {
        tmp: tmpNumber(),
        requisitionId: input.requisitionId,
        vendorId: input.vendorId,
        vendorReference: input.vendorReference,
        deliveryDays: input.deliveryDays,
        paymentTerms: input.paymentTerms,
        notes: input.notes,
        quoteDate: toDate(input.quoteDate),
        validUntil: toDate(input.validUntil),
        ...totals,
        status: QUOTATION_STATUS.RECEIVED,
        actor: actor.id,
      }
    ))!;
    const quotationNumber = await assignNumber(tx, "quotations", "quotation_number", P.quotation, q.id);
    for (const l of input.lines) {
      await execute(
        tx,
        `INSERT INTO dbo.quotation_items (quotation_id, requisition_item_id, quantity, unit_price, tax_rate, line_total, remarks)
         VALUES (@qid, @requisitionItemId, @quantity, @unitPrice, @taxRate, @lineTotal, @remarks)`,
        { qid: q.id, ...l, lineTotal: lineAmounts(l).total }
      );
    }
    if (pr.status === PR_STATUS.OPEN) {
      await execute(tx, `UPDATE dbo.purchase_requisitions SET status = @s, updated_at = SYSUTCDATETIME() WHERE id = @id`, {
        id: input.requisitionId,
        s: PR_STATUS.QUOTATION,
      });
    }
    await audit(tx, { actorUserId: actor.id, action: "quotation.create", entityType: "quotation", entityId: q.id, after: { quotationNumber, ...input, ...totals }, correlationId });
    return { id: q.id, quotationNumber };
  });
}

export async function selectQuotation(actor: AuthUser, quotationId: number, reason: string, correlationId?: string) {
  return withTransaction(async (tx) => {
    const q = await queryOne<{ requisitionId: number; prStatus: string }>(
      tx,
      `SELECT q.requisition_id AS requisitionId, pr.status AS prStatus
       FROM dbo.quotations q JOIN dbo.purchase_requisitions pr ON pr.id = q.requisition_id WHERE q.id = @id`,
      { id: quotationId }
    );
    if (!q) throw notFound("Quotation");
    if (![PR_STATUS.OPEN, PR_STATUS.QUOTATION].includes(q.prStatus as never)) throw conflict("A vendor has already been ordered for this requisition");
    await execute(tx, `UPDATE dbo.quotations SET status = @no, selection_reason = NULL WHERE requisition_id = @pr AND id <> @id`, {
      pr: q.requisitionId,
      id: quotationId,
      no: QUOTATION_STATUS.NOT_SELECTED,
    });
    await execute(tx, `UPDATE dbo.quotations SET status = @yes, selection_reason = @reason WHERE id = @id`, {
      id: quotationId,
      yes: QUOTATION_STATUS.SELECTED,
      reason,
    });
    await audit(tx, { actorUserId: actor.id, action: "quotation.select", entityType: "quotation", entityId: quotationId, after: { reason }, correlationId });
    return { id: quotationId };
  });
}

export async function listQuotations(q: ListQuery) {
  const where = new Where();
  if (q.search) where.add("(qt.quotation_number LIKE @s OR v.name LIKE @s OR pr.pr_number LIKE @s)", { s: likeContains(q.search) });
  if (q.status) where.add("qt.status = @status", { status: q.status });
  return paged(
    await getPool(),
    `SELECT qt.id, qt.quotation_number AS quotationNumber, qt.quote_date AS quoteDate, qt.valid_until AS validUntil, qt.status,
            CONVERT(NVARCHAR(40), qt.total_amount) AS totalAmount, qt.delivery_days AS deliveryDays,
            v.name AS [vendor.name], pr.id AS [requisition.id], pr.pr_number AS [requisition.prNumber], pr.title AS [requisition.title]`,
    `FROM dbo.quotations qt JOIN dbo.vendors v ON v.id = qt.vendor_id JOIN dbo.purchase_requisitions pr ON pr.id = qt.requisition_id`,
    where,
    "qt.created_at DESC, qt.id DESC",
    q
  );
}

// ══ Purchase orders ══════════════════════════════════════════════════════════

interface PoLine {
  requisitionItemId: number | null;
  requestItemId: number | null;
  itemId: number | null;
  categoryId: number;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

async function insertPo(
  tx: Tx,
  actor: AuthUser,
  header: {
    vendorId: number;
    requisitionId: number | null;
    quotationId: number | null;
    orderDate: Date;
    expectedDate: Date | null;
    deliveryWarehouseId: number;
    department: string | null;
    costCentre: string | null;
    terms: string | null;
    notes: string | null;
  },
  lines: PoLine[]
) {
  const wh = await queryOne<{ isActive: boolean }>(tx, `SELECT is_active AS isActive FROM dbo.warehouses WHERE id = @id`, { id: header.deliveryWarehouseId });
  if (!wh?.isActive) throw new AppError("VALIDATION_ERROR", "Delivery warehouse is invalid", [{ path: "deliveryWarehouseId", message: "Choose an active warehouse" }]);
  const totals = documentTotals(lines);
  const po = (await queryOne<{ id: number }>(
    tx,
    `INSERT INTO dbo.purchase_orders (po_number, vendor_id, requisition_id, quotation_id, status, order_date, expected_date,
       delivery_warehouse_id, department, cost_centre, subtotal, tax_amount, total_amount, terms, notes, created_by_user_id)
     OUTPUT INSERTED.id
     VALUES (@tmp, @vendorId, @requisitionId, @quotationId, @status, @orderDate, @expectedDate, @deliveryWarehouseId,
       @department, @costCentre, @subtotal, @taxAmount, @totalAmount, @terms, @notes, @actor)`,
    { tmp: tmpNumber(), ...header, ...totals, status: PO_STATUS.DRAFT, actor: actor.id }
  ))!;
  const poNumber = await assignNumber(tx, "purchase_orders", "po_number", P.purchaseOrder, po.id);
  for (const l of lines) {
    await execute(
      tx,
      `INSERT INTO dbo.purchase_order_items (purchase_order_id, requisition_item_id, request_item_id, item_id, category_id, description,
         quantity, unit_price, tax_rate, line_total)
       VALUES (@poId, @requisitionItemId, @requestItemId, @itemId, @categoryId, @description, @quantity, @unitPrice, @taxRate, @lineTotal)`,
      { poId: po.id, ...l, lineTotal: lineAmounts(l).total }
    );
  }
  return { id: po.id, poNumber, ...totals };
}

export async function createPoFromQuotation(
  actor: AuthUser,
  input: { quotationId: number; deliveryWarehouseId: number; expectedDate: string | null; terms: string | null; notes: string | null },
  correlationId?: string
) {
  return withTransaction(async (tx) => {
    const qt = await queryOne<{ id: number; status: string; vendorId: number; requisitionId: number; paymentTerms: string | null; deliveryDays: number | null; department: string | null; costCentre: string | null }>(
      tx,
      `SELECT q.id, q.status, q.vendor_id AS vendorId, q.requisition_id AS requisitionId, q.payment_terms AS paymentTerms,
              q.delivery_days AS deliveryDays, pr.department, pr.cost_centre AS costCentre
       FROM dbo.quotations q JOIN dbo.purchase_requisitions pr WITH (UPDLOCK) ON pr.id = q.requisition_id WHERE q.id = @id`,
      { id: input.quotationId }
    );
    if (!qt) throw notFound("Quotation");
    if (qt.status !== QUOTATION_STATUS.SELECTED) throw conflict("Select this quotation before raising a purchase order");
    const existing = await queryOne<{ poNumber: string }>(
      tx,
      `SELECT TOP 1 po_number AS poNumber FROM dbo.purchase_orders WHERE quotation_id = @id AND status <> @cancelled`,
      { id: qt.id, cancelled: PO_STATUS.CANCELLED }
    );
    if (existing) throw conflict(`Purchase order ${existing.poNumber} already exists for this quotation`);

    const lines = await query<PoLine>(
      tx,
      `SELECT qi.requisition_item_id AS requisitionItemId, pri.request_item_id AS requestItemId, pri.item_id AS itemId,
              pri.category_id AS categoryId, pri.description, qi.quantity, qi.unit_price AS unitPrice, qi.tax_rate AS taxRate
       FROM dbo.quotation_items qi JOIN dbo.purchase_requisition_items pri ON pri.id = qi.requisition_item_id
       WHERE qi.quotation_id = @id ORDER BY qi.id`,
      { id: qt.id }
    );
    const orderDate = new Date();
    const expected =
      toDate(input.expectedDate) ?? (qt.deliveryDays ? new Date(orderDate.getTime() + qt.deliveryDays * 86_400_000) : null);
    const po = await insertPo(
      tx,
      actor,
      {
        vendorId: qt.vendorId,
        requisitionId: qt.requisitionId,
        quotationId: qt.id,
        orderDate,
        expectedDate: expected,
        deliveryWarehouseId: input.deliveryWarehouseId,
        department: qt.department,
        costCentre: qt.costCentre,
        terms: input.terms ?? (qt.paymentTerms ? `Payment: ${qt.paymentTerms}` : null),
        notes: input.notes,
      },
      lines.map((l) => ({ ...l, unitPrice: Number(l.unitPrice), taxRate: Number(l.taxRate) }))
    );
    await execute(tx, `UPDATE dbo.purchase_requisitions SET status = @s, updated_at = SYSUTCDATETIME() WHERE id = @id`, {
      id: qt.requisitionId,
      s: PR_STATUS.ORDERED,
    });
    await audit(tx, { actorUserId: actor.id, action: "po.create", entityType: "purchase_order", entityId: po.id, after: { ...po, quotationId: qt.id }, correlationId });
    return po;
  });
}

export async function createPo(actor: AuthUser, input: PoCreateInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    const vendor = await queryOne<{ isActive: boolean }>(tx, `SELECT is_active AS isActive FROM dbo.vendors WHERE id = @id`, { id: input.vendorId });
    if (!vendor?.isActive) throw new AppError("VALIDATION_ERROR", "Vendor is invalid or inactive", [{ path: "vendorId", message: "Choose an active vendor" }]);
    const items = await query<{ id: number; categoryId: number; name: string; description: string | null }>(
      tx,
      `SELECT id, category_id AS categoryId, item_name AS name, description FROM dbo.item_master
       WHERE id IN (@ids) AND is_deleted = 0 AND is_active = 1`,
      { ids: input.lines.map((l) => l.itemId) }
    );
    const lines: PoLine[] = input.lines.map((l, i) => {
      const it = items.find((x) => x.id === l.itemId);
      if (!it) throw new AppError("VALIDATION_ERROR", "Item is not available", [{ path: `lines.${i}.itemId`, message: "Item is not available" }]);
      return {
        requisitionItemId: null,
        requestItemId: null,
        itemId: it.id,
        categoryId: it.categoryId,
        description: l.description ?? it.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
      };
    });
    const po = await insertPo(
      tx,
      actor,
      {
        vendorId: input.vendorId,
        requisitionId: null,
        quotationId: null,
        orderDate: toDate(input.orderDate) ?? new Date(),
        expectedDate: toDate(input.expectedDate),
        deliveryWarehouseId: input.deliveryWarehouseId,
        department: input.department,
        costCentre: input.costCentre,
        terms: input.terms,
        notes: input.notes,
      },
      lines
    );
    await audit(tx, { actorUserId: actor.id, action: "po.create", entityType: "purchase_order", entityId: po.id, after: { ...po, ...input }, correlationId });
    return po;
  });
}

const PO_COLS = `po.id, po.po_number AS poNumber, po.status, po.order_date AS orderDate, po.expected_date AS expectedDate,
  po.department, po.cost_centre AS costCentre, CONVERT(NVARCHAR(40), po.subtotal) AS subtotal,
  CONVERT(NVARCHAR(40), po.tax_amount) AS taxAmount, CONVERT(NVARCHAR(40), po.total_amount) AS totalAmount,
  po.terms, po.notes, po.submitted_at AS submittedAt, po.approved_at AS approvedAt, po.approval_comments AS approvalComments,
  po.sent_at AS sentAt, po.cancelled_reason AS cancelledReason, po.created_at AS createdAt, po.created_by_user_id AS createdByUserId,
  v.id AS [vendor.id], v.name AS [vendor.name], v.code AS [vendor.code], v.gstin AS [vendor.gstin],
  w.id AS [warehouse.id], w.name AS [warehouse.name], cb.full_name AS [createdBy.fullName], ab.full_name AS [approvedBy.fullName],
  pr.id AS [requisition.id], pr.pr_number AS [requisition.prNumber]`;

const PO_FROM = `FROM dbo.purchase_orders po
  JOIN dbo.vendors v ON v.id = po.vendor_id
  JOIN dbo.warehouses w ON w.id = po.delivery_warehouse_id
  JOIN dbo.users cb ON cb.id = po.created_by_user_id
  LEFT JOIN dbo.users ab ON ab.id = po.approved_by_user_id
  LEFT JOIN dbo.purchase_requisitions pr ON pr.id = po.requisition_id`;

export async function listPurchaseOrders(q: ListQuery & { vendorId?: number; receivable?: boolean }) {
  const where = new Where();
  if (q.search) where.add("(po.po_number LIKE @s OR v.name LIKE @s OR po.department LIKE @s)", { s: likeContains(q.search) });
  if (q.status) where.add("po.status = @status", { status: q.status });
  if (q.vendorId) where.add("po.vendor_id = @vendorId", { vendorId: q.vendorId });
  if (q.receivable) where.add("po.status IN (@recv)", { recv: [PO_STATUS.APPROVED, PO_STATUS.SENT_TO_VENDOR, PO_STATUS.PARTIALLY_RECEIVED] });
  return paged(await getPool(), `SELECT ${PO_COLS}`, PO_FROM, where, "po.created_at DESC, po.id DESC", q);
}

export async function getPurchaseOrder(poId: number) {
  const pool = await getPool();
  const [[header], items, receipts, receiptItems, invoices] = await queryMany(
    pool,
    `SELECT ${PO_COLS} ${PO_FROM} WHERE po.id = @id;

     SELECT x.id, x.description, x.quantity, x.received_quantity AS receivedQuantity, CONVERT(NVARCHAR(40), x.unit_price) AS unitPrice,
            CONVERT(NVARCHAR(40), x.tax_rate) AS taxRate, CONVERT(NVARCHAR(40), x.line_total) AS lineTotal,
            c.id AS [category.id], c.name AS [category.name], c.is_serialized AS [category.isSerialized],
            im.item_code AS [item.code], im.item_name AS [item.name],
            r.id AS [request.id], r.request_number AS [request.requestNumber]
     FROM dbo.purchase_order_items x
     JOIN dbo.hardware_categories c ON c.id = x.category_id
     LEFT JOIN dbo.item_master im ON im.id = x.item_id
     LEFT JOIN dbo.hardware_request_items ri ON ri.id = x.request_item_id
     LEFT JOIN dbo.hardware_requests r ON r.id = ri.hardware_request_id
     WHERE x.purchase_order_id = @id ORDER BY x.id;

     SELECT g.id, g.grn_number AS grnNumber, g.received_date AS receivedDate, g.delivery_note AS deliveryNote, g.notes,
            w.name AS [warehouse.name], u.full_name AS [receivedBy.fullName]
     FROM dbo.goods_receipts g JOIN dbo.warehouses w ON w.id = g.warehouse_id JOIN dbo.users u ON u.id = g.received_by_user_id
     WHERE g.purchase_order_id = @id ORDER BY g.id;

     SELECT gi.goods_receipt_id AS goodsReceiptId, gi.purchase_order_item_id AS purchaseOrderItemId, gi.quantity_received AS quantityReceived,
            gi.quantity_accepted AS quantityAccepted, gi.quantity_rejected AS quantityRejected, gi.rejection_reason AS rejectionReason,
            gi.serial_numbers AS serialNumbers
     FROM dbo.goods_receipt_items gi JOIN dbo.goods_receipts g ON g.id = gi.goods_receipt_id WHERE g.purchase_order_id = @id;

     SELECT i.id, i.reference_number AS referenceNumber, i.vendor_invoice_number AS vendorInvoiceNumber, i.status,
            CONVERT(NVARCHAR(40), i.total_amount) AS totalAmount, CONVERT(NVARCHAR(40), i.paid_amount) AS paidAmount
     FROM dbo.invoices i WHERE i.purchase_order_id = @id ORDER BY i.id;`,
    { id: poId }
  );
  if (!header) throw notFound("Purchase order");
  return { ...header, items, receipts: receipts.map((g) => ({ ...g, items: receiptItems.filter((x) => x.goodsReceiptId === g.id) })), invoices };
}

async function loadPoForUpdate(tx: Tx, poId: number) {
  const po = await queryOne<{ id: number; poNumber: string; status: PoStatus; createdByUserId: number; requisitionId: number | null; totalAmount: string }>(
    tx,
    `SELECT id, po_number AS poNumber, status, created_by_user_id AS createdByUserId, requisition_id AS requisitionId,
            CONVERT(NVARCHAR(40), total_amount) AS totalAmount
     FROM dbo.purchase_orders WITH (UPDLOCK, HOLDLOCK) WHERE id = @id`,
    { id: poId }
  );
  if (!po) throw notFound("Purchase order");
  return po;
}

function poTransition(from: PoStatus, to: PoStatus) {
  if (!canTransition(PO_TRANSITIONS, from, to)) throw conflict(`A purchase order in "${from}" cannot move to "${to}"`);
}

export type PoAction = "submit" | "approve" | "reject" | "send" | "cancel" | "close";

/** PO lifecycle actions. Approval needs procurement.po.approve and a different user than the creator. */
export async function actOnPurchaseOrder(actor: AuthUser, poId: number, action: PoAction, comments: string | null, correlationId?: string) {
  return withTransaction(async (tx) => {
    const po = await loadPoForUpdate(tx, poId);
    const set: string[] = ["updated_at = SYSUTCDATETIME()"];
    let next: PoStatus;
    switch (action) {
      case "submit":
        if (!userHas(actor, "procurement.manage")) throw forbidden();
        next = PO_STATUS.PENDING_APPROVAL;
        set.push("submitted_at = SYSUTCDATETIME()");
        break;
      case "approve":
      case "reject":
        if (!userHas(actor, "procurement.po.approve")) throw forbidden("You cannot approve purchase orders");
        if (po.createdByUserId === actor.id) throw forbidden("A purchase order must be approved by someone other than its creator");
        if (po.status !== PO_STATUS.PENDING_APPROVAL) throw conflict("Only purchase orders pending approval can be approved or rejected");
        if (action === "reject" && !comments) throw new AppError("VALIDATION_ERROR", "Give a reason for sending it back", [{ path: "comments", message: "Required" }]);
        next = action === "approve" ? PO_STATUS.APPROVED : PO_STATUS.DRAFT;
        set.push("approval_comments = @comments");
        if (action === "approve") set.push("approved_by_user_id = @actor, approved_at = SYSUTCDATETIME()");
        break;
      case "send":
        if (!userHas(actor, "procurement.manage")) throw forbidden();
        next = PO_STATUS.SENT_TO_VENDOR;
        set.push("sent_at = SYSUTCDATETIME()");
        break;
      case "cancel": {
        if (!userHas(actor, "procurement.manage")) throw forbidden();
        if (!comments) throw new AppError("VALIDATION_ERROR", "Give a reason for cancelling", [{ path: "comments", message: "Required" }]);
        const received = await queryOne<{ n: number }>(tx, `SELECT COUNT(*) AS n FROM dbo.goods_receipts WHERE purchase_order_id = @id`, { id: poId });
        if (received?.n) throw conflict("Goods have been received against this order; close it instead");
        next = PO_STATUS.CANCELLED;
        set.push("cancelled_reason = @comments");
        break;
      }
      case "close":
        if (!userHas(actor, "procurement.manage")) throw forbidden();
        next = PO_STATUS.CLOSED;
        break;
    }
    poTransition(po.status, next);
    set.push("status = @next");
    await execute(tx, `UPDATE dbo.purchase_orders SET ${set.join(", ")} WHERE id = @id`, { id: poId, next, comments, actor: actor.id });

    // A cancelled PO puts its requisition back to the quotation stage so another vendor can be ordered.
    if (action === "cancel" && po.requisitionId) {
      const live = await queryOne<{ n: number }>(tx, `SELECT COUNT(*) AS n FROM dbo.purchase_orders WHERE requisition_id = @pr AND status <> @c`, {
        pr: po.requisitionId,
        c: PO_STATUS.CANCELLED,
      });
      if (!live?.n) {
        await execute(tx, `UPDATE dbo.purchase_requisitions SET status = @s, updated_at = SYSUTCDATETIME() WHERE id = @id`, {
          id: po.requisitionId,
          s: PR_STATUS.QUOTATION,
        });
      }
    }
    if ((action === "approve" || action === "reject") && po.createdByUserId !== actor.id) {
      await notify(tx, {
        recipientUserId: po.createdByUserId,
        eventType: action === "approve" ? "po.approved" : "po.returned",
        title: `${po.poNumber} ${action === "approve" ? "approved" : "sent back"}`,
        body: comments ?? undefined,
        link: `/procurement/purchase-orders/${poId}`,
      });
    }
    await audit(tx, {
      actorUserId: actor.id,
      action: `po.${action}`,
      entityType: "purchase_order",
      entityId: poId,
      before: { status: po.status },
      after: { status: next, comments },
      correlationId,
    });
    return { id: poId, status: next };
  });
}

// ══ Goods receipt ════════════════════════════════════════════════════════════

const addMonths = (isoDate: string, months: number) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

export async function receiveGoods(actor: AuthUser, input: GoodsReceiptInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    const po = await loadPoForUpdate(tx, input.purchaseOrderId);
    const header = (await queryOne<{ vendorId: number; deliveryWarehouseId: number }>(
      tx,
      `SELECT vendor_id AS vendorId, delivery_warehouse_id AS deliveryWarehouseId FROM dbo.purchase_orders WHERE id = @id`,
      { id: po.id }
    ))!;
    const receivable: PoStatus[] = [PO_STATUS.APPROVED, PO_STATUS.SENT_TO_VENDOR, PO_STATUS.PARTIALLY_RECEIVED];
    if (!receivable.includes(po.status)) throw conflict(`Goods can't be received against a purchase order in "${po.status}"`);
    const warehouseId = input.warehouseId ?? header.deliveryWarehouseId;
    const wh = await queryOne<{ isActive: boolean }>(tx, `SELECT is_active AS isActive FROM dbo.warehouses WHERE id = @id`, { id: warehouseId });
    if (!wh?.isActive) throw new AppError("VALIDATION_ERROR", "Warehouse is invalid or inactive");

    const poItems = await query<{
      id: number;
      description: string;
      quantity: number;
      receivedQuantity: number;
      unitPrice: number;
      taxRate: number;
      categoryId: number;
      isSerialized: boolean;
      requestItemId: number | null;
      manufacturer: string | null;
      model: string | null;
      warrantyMonths: number | null;
    }>(
      tx,
      `SELECT x.id, x.description, x.quantity, x.received_quantity AS receivedQuantity, x.unit_price AS unitPrice, x.tax_rate AS taxRate,
              x.category_id AS categoryId, c.is_serialized AS isSerialized, x.request_item_id AS requestItemId,
              im.manufacturer, im.model, im.warranty_months AS warrantyMonths
       FROM dbo.purchase_order_items x
       JOIN dbo.hardware_categories c ON c.id = x.category_id
       LEFT JOIN dbo.item_master im ON im.id = x.item_id
       WHERE x.purchase_order_id = @id`,
      { id: po.id }
    );

    const errors: { path: string; message: string }[] = [];
    const work = input.lines
      .map((l, idx) => ({ l, idx, item: poItems.find((p) => p.id === l.purchaseOrderItemId) }))
      .filter(({ l }) => l.quantityReceived > 0);
    if (!work.length) throw new AppError("VALIDATION_ERROR", "Enter the quantity received on at least one line");
    for (const { l, idx, item } of work) {
      if (!item) {
        errors.push({ path: `lines.${idx}.purchaseOrderItemId`, message: "Not a line on this order" });
        continue;
      }
      const accepted = l.quantityReceived - l.quantityRejected;
      const open = item.quantity - item.receivedQuantity;
      if (accepted < 0) errors.push({ path: `lines.${idx}.quantityRejected`, message: "Rejected can't exceed received" });
      else if (accepted > open) errors.push({ path: `lines.${idx}.quantityReceived`, message: `Only ${open} still to receive` });
      if (l.quantityRejected > 0 && !l.rejectionReason) errors.push({ path: `lines.${idx}.rejectionReason`, message: "Say why units were rejected" });
      if (item.isSerialized && accepted > 0) {
        const serials = parseSerials(l.serialNumbers);
        if (serials.length !== accepted) errors.push({ path: `lines.${idx}.serialNumbers`, message: `Enter ${accepted} serial number(s), one per line (got ${serials.length})` });
        else if (new Set(serials.map((s) => s.toUpperCase())).size !== serials.length) errors.push({ path: `lines.${idx}.serialNumbers`, message: "Serial numbers repeat" });
      }
    }
    if (errors.length) throw new AppError("VALIDATION_ERROR", "Please correct the highlighted lines", errors);

    if (po.status === PO_STATUS.APPROVED) {
      await execute(tx, `UPDATE dbo.purchase_orders SET status = @s, sent_at = COALESCE(sent_at, SYSUTCDATETIME()) WHERE id = @id`, {
        id: po.id,
        s: PO_STATUS.SENT_TO_VENDOR,
      });
    }

    const grn = (await queryOne<{ id: number }>(
      tx,
      `INSERT INTO dbo.goods_receipts (grn_number, purchase_order_id, warehouse_id, received_date, delivery_note, notes, received_by_user_id)
       OUTPUT INSERTED.id VALUES (@tmp, @poId, @warehouseId, @receivedDate, @deliveryNote, @notes, @actor)`,
      {
        tmp: tmpNumber(),
        poId: po.id,
        warehouseId,
        receivedDate: toDate(input.receivedDate),
        deliveryNote: input.deliveryNote,
        notes: input.notes,
        actor: actor.id,
      }
    ))!;
    const grnNumber = await assignNumber(tx, "goods_receipts", "grn_number", P.goodsReceipt, grn.id);

    const touchedRequests = new Map<number, number>(); // requestId → requester
    const assetTags: string[] = [];

    for (const { l, item } of work) {
      const it = item!;
      const accepted = l.quantityReceived - l.quantityRejected;
      const serials = it.isSerialized ? parseSerials(l.serialNumbers) : [];
      await execute(
        tx,
        `INSERT INTO dbo.goods_receipt_items (goods_receipt_id, purchase_order_item_id, quantity_received, quantity_accepted,
           quantity_rejected, rejection_reason, serial_numbers)
         VALUES (@grnId, @poItemId, @received, @accepted, @rejected, @reason, @serials)`,
        {
          grnId: grn.id,
          poItemId: it.id,
          received: l.quantityReceived,
          accepted,
          rejected: l.quantityRejected,
          reason: l.rejectionReason,
          serials: serials.length ? serials.join("\n") : null,
        }
      );
      if (accepted === 0) continue;

      const unitCost = money(Number(it.unitPrice) * (1 + Number(it.taxRate) / 100));
      if (it.isSerialized) {
        for (const serial of serials) {
          const a = await registerAssetInTx(
            tx,
            actor,
            {
              categoryId: it.categoryId,
              warehouseId,
              serialNumber: serial,
              manufacturer: it.manufacturer,
              model: it.model,
              specification: it.description,
              purchaseDate: input.receivedDate,
              purchaseCost: unitCost,
              warrantyEndDate: it.warrantyMonths ? addMonths(input.receivedDate, it.warrantyMonths) : null,
              condition: "New",
              notes: `Received on ${grnNumber} against ${po.poNumber}`,
            },
            correlationId,
            { purchaseOrderItemId: it.id, vendorId: header.vendorId, reason: `Goods receipt ${grnNumber}` }
          );
          assetTags.push(a.assetTag);
        }
      } else {
        await moveStock(tx, it.categoryId, warehouseId, accepted, null, "quantityAvailable");
        await recordMovementRow(tx, {
          categoryId: it.categoryId,
          warehouseId,
          movementType: "Receipt",
          quantity: accepted,
          reason: `Goods receipt ${grnNumber} (${po.poNumber})`,
          referenceType: "goods_receipt",
          referenceId: grn.id,
          actorId: actor.id,
        });
      }
      await execute(tx, `UPDATE dbo.purchase_order_items SET received_quantity = received_quantity + @n WHERE id = @id`, { id: it.id, n: accepted });

      // Reserve what arrived for the employee request this line was bought for.
      if (it.requestItemId) {
        const ri = await queryOne<{ procurementQuantity: number; requestId: number; requesterId: number; status: string }>(
          tx,
          `SELECT i.procurement_quantity AS procurementQuantity, r.id AS requestId, r.requester_user_id AS requesterId, r.status
           FROM dbo.hardware_request_items i WITH (UPDLOCK) JOIN dbo.hardware_requests r ON r.id = i.hardware_request_id
           WHERE i.id = @id`,
          { id: it.requestItemId }
        );
        if (ri && FULFILMENT_PHASE.includes(ri.status as never)) {
          const n = Math.min(accepted, ri.procurementQuantity);
          if (n > 0) {
            await execute(
              tx,
              `UPDATE dbo.hardware_request_items
               SET procurement_quantity = procurement_quantity - @n, procured_received_quantity = procured_received_quantity + @n
               WHERE id = @id`,
              { id: it.requestItemId, n }
            );
            await reserveForItem(tx, actor, { id: it.requestItemId, categoryId: it.categoryId, isSerialized: it.isSerialized }, warehouseId, n, correlationId);
            touchedRequests.set(ri.requestId, ri.requesterId);
          }
        }
      }
    }

    const after = await query<{ quantity: number; receivedQuantity: number }>(
      tx,
      `SELECT quantity, received_quantity AS receivedQuantity FROM dbo.purchase_order_items WHERE purchase_order_id = @id`,
      { id: po.id }
    );
    const nextStatus = poStatusAfterReceipt(after);
    await execute(tx, `UPDATE dbo.purchase_orders SET status = @s, updated_at = SYSUTCDATETIME() WHERE id = @id`, { id: po.id, s: nextStatus });

    if (po.requisitionId && nextStatus === PO_STATUS.FULLY_RECEIVED) {
      await execute(
        tx,
        `UPDATE dbo.purchase_requisitions SET status = @closed, updated_at = SYSUTCDATETIME()
         WHERE id = @id AND NOT EXISTS (
           SELECT 1 FROM dbo.purchase_orders WHERE requisition_id = @id AND status NOT IN (@done))`,
        { id: po.requisitionId, closed: PR_STATUS.CLOSED, done: [PO_STATUS.FULLY_RECEIVED, PO_STATUS.CLOSED, PO_STATUS.CANCELLED] }
      );
    }

    for (const [requestId, requesterId] of touchedRequests) {
      await recomputeFulfilment(tx, requestId, actor.id);
      await notify(tx, {
        recipientUserId: requesterId,
        eventType: NOTIFICATION_EVENT.STOCK_RESERVED,
        title: "Your ordered hardware has arrived",
        body: `Received on ${grnNumber}. IT will arrange the handover.`,
        link: `/requests/${requestId}`,
      });
    }

    await audit(tx, {
      actorUserId: actor.id,
      action: "po.receive",
      entityType: "purchase_order",
      entityId: po.id,
      before: { status: po.status },
      after: { status: nextStatus, grnNumber, warehouseId, lines: input.lines, assetTags },
      correlationId,
    });
    return { id: grn.id, grnNumber, status: nextStatus, assetTags };
  });
}

export async function listGoodsReceipts(q: ListQuery) {
  const where = new Where();
  if (q.search) where.add("(g.grn_number LIKE @s OR po.po_number LIKE @s OR v.name LIKE @s OR g.delivery_note LIKE @s)", { s: likeContains(q.search) });
  return paged(
    await getPool(),
    `SELECT g.id, g.grn_number AS grnNumber, g.received_date AS receivedDate, g.delivery_note AS deliveryNote,
            po.id AS [purchaseOrder.id], po.po_number AS [purchaseOrder.poNumber], v.name AS [vendor.name],
            w.name AS [warehouse.name], u.full_name AS [receivedBy.fullName],
            (SELECT SUM(quantity_accepted) FROM dbo.goods_receipt_items WHERE goods_receipt_id = g.id) AS acceptedUnits,
            (SELECT SUM(quantity_rejected) FROM dbo.goods_receipt_items WHERE goods_receipt_id = g.id) AS rejectedUnits`,
    `FROM dbo.goods_receipts g
     JOIN dbo.purchase_orders po ON po.id = g.purchase_order_id
     JOIN dbo.vendors v ON v.id = po.vendor_id
     JOIN dbo.warehouses w ON w.id = g.warehouse_id
     JOIN dbo.users u ON u.id = g.received_by_user_id`,
    where,
    "g.received_date DESC, g.id DESC",
    q
  );
}
