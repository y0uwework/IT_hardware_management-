// Finance: budgets, invoices (3-way matched against PO and goods receipts), payments.
// Separation of duties: the user who verifies an invoice cannot approve it.

import { Where, execute, getPool, likeContains, query, queryMany, queryOne, withTransaction, type Tx } from "../../lib/db";
import { AppError, conflict, forbidden, notFound } from "../../lib/errors";
import type { AuthUser } from "../../lib/auth";
import { appConfig, fiscalYearRange } from "../../config/app.config";
import { INVOICE_STATUS, INVOICE_TRANSITIONS, PO_STATUS, canTransition, type InvoiceStatus } from "../../config/status.config";
import { audit } from "../utils/audit";
import { assignNumber, tmpNumber } from "../utils/numbering";
import { skipTake } from "../../lib/validation";
import { userHas } from "../middleware/authorize";
import { documentTotals, lineAmounts, matchInvoice, money, outstanding, type MatchLine } from "./procurement-rules";
import type { ListQuery } from "../validators/procurement.validators";
import type { BudgetInput, InvoiceInput, PaymentInput } from "../validators/finance.validators";

const P = appConfig.numberPrefixes;
const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);
/** PO statuses that commit budget. */
export const COMMITTED_PO = [PO_STATUS.APPROVED, PO_STATUS.SENT_TO_VENDOR, PO_STATUS.PARTIALLY_RECEIVED, PO_STATUS.FULLY_RECEIVED, PO_STATUS.CLOSED];

// ══ Budgets ══════════════════════════════════════════════════════════════════

export async function listDepartments() {
  const rows = await query<{ department: string }>(
    await getPool(),
    `SELECT DISTINCT department FROM (
       SELECT department FROM dbo.users WHERE department IS NOT NULL AND department <> ''
       UNION SELECT department FROM dbo.budgets
       UNION SELECT department FROM dbo.purchase_orders WHERE department IS NOT NULL) d
     ORDER BY department`
  );
  return rows.map((r) => r.department);
}

/** Budgets for a fiscal year with committed (approved PO value) and spent (payments) amounts. */
export async function listBudgets(fiscalYear: string) {
  const { start, end } = fiscalYearRange(fiscalYear);
  return query(
    await getPool(),
    `SELECT b.id, b.fiscal_year AS fiscalYear, b.department, b.cost_centre AS costCentre, b.notes,
            CONVERT(NVARCHAR(40), b.amount) AS amount,
            CONVERT(NVARCHAR(40), COALESCE((
              SELECT SUM(po.total_amount) FROM dbo.purchase_orders po
              WHERE po.status IN (@committed) AND po.order_date >= @start AND po.order_date < @end
                AND po.department = b.department AND (b.cost_centre = N'' OR po.cost_centre = b.cost_centre)), 0)) AS committed,
            CONVERT(NVARCHAR(40), COALESCE((
              SELECT SUM(p.amount + p.tds_amount) FROM dbo.payments p
              JOIN dbo.invoices i ON i.id = p.invoice_id JOIN dbo.purchase_orders po ON po.id = i.purchase_order_id
              WHERE p.payment_date >= @start AND p.payment_date < @end
                AND po.department = b.department AND (b.cost_centre = N'' OR po.cost_centre = b.cost_centre)), 0)) AS spent
     FROM dbo.budgets b WHERE b.fiscal_year = @fy
     ORDER BY b.department, b.cost_centre`,
    { fy: fiscalYear, start, end, committed: COMMITTED_PO }
  );
}

export async function saveBudget(actor: AuthUser, budgetId: number | null, input: BudgetInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    const before = budgetId ? await queryOne(tx, `SELECT * FROM dbo.budgets WHERE id = @id`, { id: budgetId }) : null;
    if (budgetId && !before) throw notFound("Budget");
    const dup = await queryOne<{ id: number }>(
      tx,
      `SELECT id FROM dbo.budgets WHERE fiscal_year = @fiscalYear AND department = @department AND cost_centre = @costCentre AND id <> @id`,
      { ...input, id: budgetId ?? 0 }
    );
    if (dup) throw new AppError("VALIDATION_ERROR", "A budget already exists for this year, department and cost centre", [{ path: "department", message: "Already budgeted — edit that one" }]);
    let rowId = budgetId;
    if (budgetId) {
      await execute(
        tx,
        `UPDATE dbo.budgets SET fiscal_year = @fiscalYear, department = @department, cost_centre = @costCentre, amount = @amount,
           notes = @notes, updated_at = SYSUTCDATETIME() WHERE id = @id`,
        { ...input, id: budgetId }
      );
    } else {
      rowId = (await queryOne<{ id: number }>(
        tx,
        `INSERT INTO dbo.budgets (fiscal_year, department, cost_centre, amount, notes, created_by_user_id)
         OUTPUT INSERTED.id VALUES (@fiscalYear, @department, @costCentre, @amount, @notes, @actor)`,
        { ...input, actor: actor.id }
      ))!.id;
    }
    await audit(tx, { actorUserId: actor.id, action: budgetId ? "budget.update" : "budget.create", entityType: "budget", entityId: rowId!, before, after: input, correlationId });
    return { id: rowId };
  });
}

// ══ Invoices ═════════════════════════════════════════════════════════════════

/** PO lines with what has been accepted at goods receipt and already invoiced elsewhere. */
async function loadMatchBase(tx: Tx, poId: number, excludeInvoiceId: number | null) {
  return query<{
    id: number;
    description: string;
    quantity: number;
    receivedQuantity: number;
    unitPrice: number;
    taxRate: number;
    invoicedQuantity: number;
  }>(
    tx,
    `SELECT x.id, x.description, x.quantity, x.received_quantity AS receivedQuantity, x.unit_price AS unitPrice, x.tax_rate AS taxRate,
            COALESCE((SELECT SUM(ii.quantity) FROM dbo.invoice_items ii JOIN dbo.invoices i ON i.id = ii.invoice_id
                      WHERE ii.purchase_order_item_id = x.id AND i.status <> @rejected AND i.id <> @exclude), 0) AS invoicedQuantity
     FROM dbo.purchase_order_items x WHERE x.purchase_order_id = @poId ORDER BY x.id`,
    { poId, rejected: INVOICE_STATUS.REJECTED, exclude: excludeInvoiceId ?? 0 }
  );
}

/** Lines to pre-fill a new invoice: accepted but not yet invoiced, at PO price. */
export async function invoiceDraft(poId: number) {
  const pool = await getPool();
  const po = await queryOne<{ id: number; poNumber: string; status: string; vendorId: number; vendorName: string; paymentTermsDays: number | null }>(
    pool,
    `SELECT po.id, po.po_number AS poNumber, po.status, v.id AS vendorId, v.name AS vendorName, v.payment_terms_days AS paymentTermsDays
     FROM dbo.purchase_orders po JOIN dbo.vendors v ON v.id = po.vendor_id WHERE po.id = @id`,
    { id: poId }
  );
  if (!po) throw notFound("Purchase order");
  const lines = await loadMatchBase(pool, poId, null);
  return {
    ...po,
    lines: lines.map((l) => ({
      purchaseOrderItemId: l.id,
      description: l.description,
      orderedQuantity: l.quantity,
      acceptedQuantity: l.receivedQuantity,
      invoicedQuantity: l.invoicedQuantity,
      suggestedQuantity: Math.max(0, l.receivedQuantity - l.invoicedQuantity),
      unitPrice: Number(l.unitPrice),
      taxRate: Number(l.taxRate),
    })),
  };
}

function matchLines(base: Awaited<ReturnType<typeof loadMatchBase>>, lines: { purchaseOrderItemId: number; quantity: number; unitPrice: number; taxRate: number }[]): MatchLine[] {
  return lines.map((l) => {
    const b = base.find((x) => x.id === l.purchaseOrderItemId)!;
    return {
      poItemId: b.id,
      description: b.description.split(" — ")[0],
      orderedQuantity: b.quantity,
      acceptedQuantity: b.receivedQuantity,
      previouslyInvoicedQuantity: b.invoicedQuantity,
      poUnitPrice: Number(b.unitPrice),
      poTaxRate: Number(b.taxRate),
      invoiceQuantity: l.quantity,
      invoiceUnitPrice: Number(l.unitPrice),
      invoiceTaxRate: Number(l.taxRate),
    };
  });
}

async function addEvent(tx: Tx, invoiceId: number, actorId: number, action: string, comments: string | null) {
  await execute(tx, `INSERT INTO dbo.invoice_events (invoice_id, actor_user_id, [action], comments) VALUES (@invoiceId, @actorId, @action, @comments)`, {
    invoiceId,
    actorId,
    action,
    comments,
  });
}

export async function createInvoice(actor: AuthUser, input: InvoiceInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    const po = await queryOne<{ status: string; vendorId: number; paymentTermsDays: number | null; poNumber: string }>(
      tx,
      `SELECT po.status, po.vendor_id AS vendorId, v.payment_terms_days AS paymentTermsDays, po.po_number AS poNumber
       FROM dbo.purchase_orders po JOIN dbo.vendors v ON v.id = po.vendor_id WHERE po.id = @id`,
      { id: input.purchaseOrderId }
    );
    if (!po) throw notFound("Purchase order");
    const invoiceable = [PO_STATUS.SENT_TO_VENDOR, PO_STATUS.PARTIALLY_RECEIVED, PO_STATUS.FULLY_RECEIVED, PO_STATUS.CLOSED];
    if (!invoiceable.includes(po.status as never)) throw conflict(`Invoices can't be entered against a purchase order in "${po.status}"`);
    const dup = await queryOne<{ ref: string }>(
      tx,
      `SELECT reference_number AS ref FROM dbo.invoices WHERE vendor_id = @v AND vendor_invoice_number = @n`,
      { v: po.vendorId, n: input.vendorInvoiceNumber }
    );
    if (dup) throw new AppError("VALIDATION_ERROR", "Duplicate invoice", [{ path: "vendorInvoiceNumber", message: `Already entered as ${dup.ref}` }]);

    const base = await loadMatchBase(tx, input.purchaseOrderId, null);
    input.lines.forEach((l, i) => {
      if (!base.some((b) => b.id === l.purchaseOrderItemId)) {
        throw new AppError("VALIDATION_ERROR", "Line is not on this purchase order", [{ path: `lines.${i}.purchaseOrderItemId`, message: "Not on this PO" }]);
      }
    });
    const totals = documentTotals(input.lines);
    const due = toDate(input.dueDate) ?? (po.paymentTermsDays != null ? new Date(new Date(input.invoiceDate).getTime() + po.paymentTermsDays * 86_400_000) : null);
    const inv = (await queryOne<{ id: number }>(
      tx,
      `INSERT INTO dbo.invoices (reference_number, vendor_invoice_number, vendor_id, purchase_order_id, invoice_date, due_date,
         subtotal, tax_amount, total_amount, status, attachment_reference, notes, created_by_user_id)
       OUTPUT INSERTED.id
       VALUES (@tmp, @vendorInvoiceNumber, @vendorId, @purchaseOrderId, @invoiceDate, @dueDate, @subtotal, @taxAmount, @totalAmount,
         @status, @attachmentReference, @notes, @actor)`,
      {
        tmp: tmpNumber(),
        vendorInvoiceNumber: input.vendorInvoiceNumber,
        vendorId: po.vendorId,
        purchaseOrderId: input.purchaseOrderId,
        invoiceDate: toDate(input.invoiceDate),
        dueDate: due,
        ...totals,
        status: INVOICE_STATUS.RECEIVED,
        attachmentReference: input.attachmentReference,
        notes: input.notes,
        actor: actor.id,
      }
    ))!;
    const referenceNumber = await assignNumber(tx, "invoices", "reference_number", P.invoice, inv.id);
    for (const l of input.lines) {
      await execute(
        tx,
        `INSERT INTO dbo.invoice_items (invoice_id, purchase_order_item_id, quantity, unit_price, tax_rate, line_total)
         VALUES (@invoiceId, @purchaseOrderItemId, @quantity, @unitPrice, @taxRate, @lineTotal)`,
        { invoiceId: inv.id, ...l, lineTotal: lineAmounts(l).total }
      );
    }
    await addEvent(tx, inv.id, actor.id, "Received", input.notes);
    await audit(tx, { actorUserId: actor.id, action: "invoice.create", entityType: "invoice", entityId: inv.id, after: { referenceNumber, ...input, ...totals }, correlationId });
    return { id: inv.id, referenceNumber };
  });
}

const INVOICE_COLS = `i.id, i.reference_number AS referenceNumber, i.vendor_invoice_number AS vendorInvoiceNumber, i.status,
  i.invoice_date AS invoiceDate, i.due_date AS dueDate, CONVERT(NVARCHAR(40), i.subtotal) AS subtotal,
  CONVERT(NVARCHAR(40), i.tax_amount) AS taxAmount, CONVERT(NVARCHAR(40), i.total_amount) AS totalAmount,
  CONVERT(NVARCHAR(40), i.paid_amount) AS paidAmount, i.attachment_reference AS attachmentReference,
  i.discrepancy_notes AS discrepancyNotes, i.notes, i.created_at AS createdAt, i.verified_at AS verifiedAt, i.approved_at AS approvedAt,
  i.created_by_user_id AS createdByUserId, i.verified_by_user_id AS verifiedByUserId,
  v.id AS [vendor.id], v.name AS [vendor.name], v.gstin AS [vendor.gstin],
  po.id AS [purchaseOrder.id], po.po_number AS [purchaseOrder.poNumber], po.department AS [purchaseOrder.department],
  cb.full_name AS [createdBy.fullName], vb.full_name AS [verifiedBy.fullName], ab.full_name AS [approvedBy.fullName]`;
const INVOICE_FROM = `FROM dbo.invoices i
  JOIN dbo.vendors v ON v.id = i.vendor_id
  JOIN dbo.purchase_orders po ON po.id = i.purchase_order_id
  JOIN dbo.users cb ON cb.id = i.created_by_user_id
  LEFT JOIN dbo.users vb ON vb.id = i.verified_by_user_id
  LEFT JOIN dbo.users ab ON ab.id = i.approved_by_user_id`;

export async function listInvoices(q: ListQuery & { overdue?: boolean }) {
  const where = new Where();
  if (q.search) where.add("(i.reference_number LIKE @s OR i.vendor_invoice_number LIKE @s OR v.name LIKE @s OR po.po_number LIKE @s)", { s: likeContains(q.search) });
  if (q.status) where.add("i.status = @status", { status: q.status });
  if (q.overdue) {
    where.add("i.due_date < CAST(SYSUTCDATETIME() AS DATE) AND i.status NOT IN (@settled)", { settled: [INVOICE_STATUS.PAID, INVOICE_STATUS.REJECTED] });
  }
  const pool = await getPool();
  const [items, total] = await Promise.all([
    query(pool, `SELECT ${INVOICE_COLS} ${INVOICE_FROM} ${where} ORDER BY i.created_at DESC, i.id DESC OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`, {
      ...where.params,
      ...skipTake(q),
    }),
    queryOne<{ total: number }>(pool, `SELECT COUNT(*) AS total ${INVOICE_FROM} ${where}`, where.params),
  ]);
  return { items, total: total?.total ?? 0 };
}

export async function getInvoice(invoiceId: number) {
  const pool = await getPool();
  const [[header], lines, events, payments] = await queryMany(
    pool,
    `SELECT ${INVOICE_COLS} ${INVOICE_FROM} WHERE i.id = @id;

     SELECT ii.id, ii.purchase_order_item_id AS purchaseOrderItemId, ii.quantity, CONVERT(NVARCHAR(40), ii.unit_price) AS unitPrice,
            CONVERT(NVARCHAR(40), ii.tax_rate) AS taxRate, CONVERT(NVARCHAR(40), ii.line_total) AS lineTotal, x.description
     FROM dbo.invoice_items ii JOIN dbo.purchase_order_items x ON x.id = ii.purchase_order_item_id WHERE ii.invoice_id = @id ORDER BY ii.id;

     SELECT e.id, e.[action], e.comments, e.created_at AS createdAt, u.full_name AS [actor.fullName]
     FROM dbo.invoice_events e JOIN dbo.users u ON u.id = e.actor_user_id WHERE e.invoice_id = @id ORDER BY e.created_at, e.id;

     SELECT p.id, p.payment_number AS paymentNumber, p.payment_date AS paymentDate, CONVERT(NVARCHAR(40), p.amount) AS amount,
            CONVERT(NVARCHAR(40), p.tds_amount) AS tdsAmount, p.payment_mode AS paymentMode, p.payment_reference AS paymentReference,
            p.notes, u.full_name AS [recordedBy.fullName]
     FROM dbo.payments p JOIN dbo.users u ON u.id = p.recorded_by_user_id WHERE p.invoice_id = @id ORDER BY p.payment_date, p.id;`,
    { id: invoiceId }
  );
  if (!header) throw notFound("Invoice");
  const base = await loadMatchBase(pool, header["purchaseOrder"].id, invoiceId);
  const match = matchLines(
    base,
    lines.map((l) => ({ purchaseOrderItemId: l.purchaseOrderItemId, quantity: l.quantity, unitPrice: Number(l.unitPrice), taxRate: Number(l.taxRate) }))
  );
  return {
    ...header,
    lines: lines.map((l) => {
      const m = match.find((x) => x.poItemId === l.purchaseOrderItemId)!;
      return { ...l, poUnitPrice: m.poUnitPrice, poTaxRate: m.poTaxRate, acceptedQuantity: m.acceptedQuantity, otherInvoicedQuantity: m.previouslyInvoicedQuantity };
    }),
    matchIssues: matchInvoice(match),
    outstanding: outstanding(Number(header.totalAmount), Number(header.paidAmount)),
    events,
    payments,
  };
}

async function loadInvoiceForUpdate(tx: Tx, invoiceId: number) {
  const inv = await queryOne<{ id: number; status: InvoiceStatus; poId: number; createdByUserId: number; verifiedByUserId: number | null; total: number; paid: number; referenceNumber: string }>(
    tx,
    `SELECT id, status, purchase_order_id AS poId, created_by_user_id AS createdByUserId, verified_by_user_id AS verifiedByUserId,
            total_amount AS total, paid_amount AS paid, reference_number AS referenceNumber
     FROM dbo.invoices WITH (UPDLOCK, HOLDLOCK) WHERE id = @id`,
    { id: invoiceId }
  );
  if (!inv) throw notFound("Invoice");
  return inv;
}

function invoiceTransition(from: InvoiceStatus, to: InvoiceStatus) {
  if (!canTransition(INVOICE_TRANSITIONS, from, to)) throw conflict(`An invoice in "${from}" cannot move to "${to}"`);
}

export async function verifyInvoice(actor: AuthUser, invoiceId: number, input: { comments: string | null; acceptDiscrepancy: boolean }, correlationId?: string) {
  return withTransaction(async (tx) => {
    const inv = await loadInvoiceForUpdate(tx, invoiceId);
    const lines = await query<{ purchaseOrderItemId: number; quantity: number; unitPrice: number; taxRate: number }>(
      tx,
      `SELECT purchase_order_item_id AS purchaseOrderItemId, quantity, unit_price AS unitPrice, tax_rate AS taxRate FROM dbo.invoice_items WHERE invoice_id = @id`,
      { id: invoiceId }
    );
    const issues = matchInvoice(matchLines(await loadMatchBase(tx, inv.poId, invoiceId), lines));
    const accept = issues.length === 0 || input.acceptDiscrepancy;
    if (issues.length && input.acceptDiscrepancy && !input.comments) {
      throw new AppError("VALIDATION_ERROR", "Explain why the discrepancy is acceptable", [{ path: "comments", message: "Required when accepting a discrepancy" }]);
    }
    const next = accept ? INVOICE_STATUS.VERIFIED : INVOICE_STATUS.DISCREPANCY;
    invoiceTransition(inv.status, next);
    await execute(
      tx,
      `UPDATE dbo.invoices SET status = @next, discrepancy_notes = @notes, updated_at = SYSUTCDATETIME()
         ${accept ? ", verified_by_user_id = @actor, verified_at = SYSUTCDATETIME()" : ""}
       WHERE id = @id`,
      { id: invoiceId, next, notes: issues.length ? issues.join("\n") : null, actor: actor.id }
    );
    const comment = [input.comments, issues.length ? `Match: ${issues.join("; ")}` : "3-way match OK"].filter(Boolean).join("\n");
    await addEvent(tx, invoiceId, actor.id, accept ? (issues.length ? "Verified with discrepancy" : "Verified") : "Discrepancy", comment);
    await audit(tx, { actorUserId: actor.id, action: "invoice.verify", entityType: "invoice", entityId: invoiceId, before: { status: inv.status }, after: { status: next, issues, comments: input.comments }, correlationId });
    return { id: invoiceId, status: next, issues };
  });
}

export async function approveInvoice(actor: AuthUser, invoiceId: number, comments: string | null, correlationId?: string) {
  return withTransaction(async (tx) => {
    const inv = await loadInvoiceForUpdate(tx, invoiceId);
    if (inv.verifiedByUserId === actor.id) throw forbidden("The person who verified an invoice cannot also approve it");
    invoiceTransition(inv.status, INVOICE_STATUS.APPROVED);
    await execute(tx, `UPDATE dbo.invoices SET status = @s, approved_by_user_id = @actor, approved_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id`, {
      id: invoiceId,
      s: INVOICE_STATUS.APPROVED,
      actor: actor.id,
    });
    await addEvent(tx, invoiceId, actor.id, "Approved for payment", comments);
    await audit(tx, { actorUserId: actor.id, action: "invoice.approve", entityType: "invoice", entityId: invoiceId, before: { status: inv.status }, after: { status: INVOICE_STATUS.APPROVED, comments }, correlationId });
    return { id: invoiceId, status: INVOICE_STATUS.APPROVED };
  });
}

export async function rejectInvoice(actor: AuthUser, invoiceId: number, reason: string, correlationId?: string) {
  return withTransaction(async (tx) => {
    const inv = await loadInvoiceForUpdate(tx, invoiceId);
    if (inv.status === INVOICE_STATUS.VERIFIED && !userHas(actor, "finance.invoice.approve")) throw forbidden("Only an approver can reject a verified invoice");
    invoiceTransition(inv.status, INVOICE_STATUS.REJECTED);
    await execute(tx, `UPDATE dbo.invoices SET status = @s, updated_at = SYSUTCDATETIME() WHERE id = @id`, { id: invoiceId, s: INVOICE_STATUS.REJECTED });
    await addEvent(tx, invoiceId, actor.id, "Rejected", reason);
    await audit(tx, { actorUserId: actor.id, action: "invoice.reject", entityType: "invoice", entityId: invoiceId, before: { status: inv.status }, after: { status: INVOICE_STATUS.REJECTED, reason }, correlationId });
    return { id: invoiceId, status: INVOICE_STATUS.REJECTED };
  });
}

// ══ Payments ═════════════════════════════════════════════════════════════════

export async function recordPayment(actor: AuthUser, input: PaymentInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    const inv = await loadInvoiceForUpdate(tx, input.invoiceId);
    if (![INVOICE_STATUS.APPROVED, INVOICE_STATUS.PARTIALLY_PAID].includes(inv.status as never)) {
      throw conflict("Only approved invoices can be paid");
    }
    const due = outstanding(Number(inv.total), Number(inv.paid));
    const settles = money(input.amount + input.tdsAmount);
    if (settles > due) {
      throw new AppError("VALIDATION_ERROR", `Payment plus TDS exceeds the ${due.toFixed(2)} outstanding`, [{ path: "amount", message: `At most ${due.toFixed(2)} with TDS` }]);
    }
    const pay = (await queryOne<{ id: number }>(
      tx,
      `INSERT INTO dbo.payments (payment_number, invoice_id, payment_date, amount, tds_amount, payment_mode, payment_reference, notes, recorded_by_user_id)
       OUTPUT INSERTED.id VALUES (@tmp, @invoiceId, @paymentDate, @amount, @tdsAmount, @paymentMode, @paymentReference, @notes, @actor)`,
      { tmp: tmpNumber(), ...input, paymentDate: toDate(input.paymentDate), actor: actor.id }
    ))!;
    const paymentNumber = await assignNumber(tx, "payments", "payment_number", P.payment, pay.id);
    const next = money(due - settles) <= 0 ? INVOICE_STATUS.PAID : INVOICE_STATUS.PARTIALLY_PAID;
    await execute(tx, `UPDATE dbo.invoices SET paid_amount = paid_amount + @settles, status = @next, updated_at = SYSUTCDATETIME() WHERE id = @id`, {
      id: inv.id,
      settles,
      next,
    });
    await addEvent(tx, inv.id, actor.id, next === INVOICE_STATUS.PAID ? "Paid in full" : "Part payment", `${paymentNumber} · ${input.paymentMode} ${input.paymentReference}`);
    await audit(tx, { actorUserId: actor.id, action: "payment.record", entityType: "invoice", entityId: inv.id, before: { status: inv.status }, after: { status: next, paymentNumber, ...input }, correlationId });
    return { id: pay.id, paymentNumber, invoiceStatus: next };
  });
}

export async function listPayments(q: ListQuery & { from?: string; to?: string }) {
  const where = new Where();
  if (q.search) where.add("(p.payment_number LIKE @s OR p.payment_reference LIKE @s OR v.name LIKE @s OR i.reference_number LIKE @s)", { s: likeContains(q.search) });
  if (q.from) where.add("p.payment_date >= @from", { from: new Date(q.from) });
  if (q.to) where.add("p.payment_date <= @to", { to: new Date(q.to) });
  const from = `FROM dbo.payments p JOIN dbo.invoices i ON i.id = p.invoice_id JOIN dbo.vendors v ON v.id = i.vendor_id JOIN dbo.users u ON u.id = p.recorded_by_user_id`;
  const pool = await getPool();
  const [items, total] = await Promise.all([
    query(
      pool,
      `SELECT p.id, p.payment_number AS paymentNumber, p.payment_date AS paymentDate, CONVERT(NVARCHAR(40), p.amount) AS amount,
              CONVERT(NVARCHAR(40), p.tds_amount) AS tdsAmount, p.payment_mode AS paymentMode, p.payment_reference AS paymentReference,
              i.id AS [invoice.id], i.reference_number AS [invoice.referenceNumber], i.vendor_invoice_number AS [invoice.vendorInvoiceNumber],
              v.name AS [vendor.name], u.full_name AS [recordedBy.fullName]
       ${from} ${where} ORDER BY p.payment_date DESC, p.id DESC OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
      { ...where.params, ...skipTake(q) }
    ),
    queryOne<{ total: number; sum: string }>(pool, `SELECT COUNT(*) AS total, CONVERT(NVARCHAR(40), COALESCE(SUM(p.amount), 0)) AS sum ${from} ${where}`, where.params),
  ]);
  return { items, total: total?.total ?? 0, sum: total?.sum ?? "0" };
}
