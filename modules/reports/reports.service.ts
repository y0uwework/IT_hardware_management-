// Reports (PRD §8.11). Each report declares its columns, filters and the permission needed,
// and runs one read-only query. Every report is organisation-wide, so all need reports.view;
// some also need a module permission (e.g. audit.view for audit activity).

import { getPool, query } from "../../shared/db";
import { forbidden, notFound } from "../../shared/errors";
import type { AuthUser } from "../../shared/auth";
import type { PermissionKey } from "../../shared/config/permissions.config";
import { APPROVAL_STATUS, ASSET_STATUS, INVOICE_STATUS, MAINTENANCE_STATUS, PO_STATUS, REQUEST_STATUS } from "../../shared/config/status.config";
import { COMMITTED_PO } from "../finance/finance.service";
import type { ReportColumn, ReportParams } from "./reports.types";

interface ReportDef {
  key: string;
  title: string;
  group: "Requests & approvals" | "Spend" | "Inventory & assets" | "Maintenance" | "Administration";
  description: string;
  permissions?: PermissionKey[]; // in addition to reports.view; any of these
  filters: { dateRange?: string; department?: boolean };
  columns: ReportColumn[];
  run: (p: ReportParams) => Promise<Record<string, unknown>[]>;
}

const pool = () => getPool();
const range = (col: string, p: ReportParams) =>
  [p.from ? `${col} >= @from` : null, p.toExclusive ? `${col} < @to` : null].filter(Boolean).join(" AND ") || "1 = 1";
const params = (p: ReportParams, extra: Record<string, unknown> = {}) => ({ from: p.from, to: p.toExclusive, department: p.department, ...extra });
const dept = (col: string, p: ReportParams) => (p.department ? `${col} = @department` : "1 = 1");
const money = (expr: string) => `CONVERT(NVARCHAR(40), CAST(COALESCE(${expr}, 0) AS DECIMAL(18,2)))`;

const OPEN_TICKETS = [MAINTENANCE_STATUS.OPEN, MAINTENANCE_STATUS.ASSIGNED, MAINTENANCE_STATUS.IN_PROGRESS, MAINTENANCE_STATUS.WAITING_FOR_PARTS];

const REPORTS: ReportDef[] = [
  // ── Requests & approvals ──
  {
    key: "requests-by-status",
    title: "Requests by status",
    group: "Requests & approvals",
    description: "How many requests are in each status, with their estimated value.",
    filters: { dateRange: "Created", department: true },
    columns: [
      { key: "status", label: "Status", type: "status" },
      { key: "requests", label: "Requests", type: "number" },
      { key: "units", label: "Units", type: "number" },
      { key: "estimatedValue", label: "Estimated value", type: "money" },
    ],
    run: async (p) =>
      query(
        await pool(),
        `SELECT r.status, COUNT(DISTINCT r.id) AS requests, COALESCE(SUM(i.quantity), 0) AS units,
                ${money("SUM(i.quantity * i.estimated_unit_price)")} AS estimatedValue
         FROM dbo.hardware_requests r JOIN dbo.users u ON u.id = r.requester_user_id
         LEFT JOIN dbo.hardware_request_items i ON i.hardware_request_id = r.id
         WHERE ${range("r.created_at", p)} AND ${dept("u.department", p)}
         GROUP BY r.status ORDER BY requests DESC`,
        params(p)
      ),
  },
  {
    key: "pending-approvals",
    title: "Pending approvals",
    group: "Requests & approvals",
    description: "Approval tasks waiting on someone, oldest first, with how long they have waited.",
    filters: { department: true },
    columns: [
      { key: "requestNumber", label: "Request" },
      { key: "requester", label: "Requester" },
      { key: "department", label: "Department" },
      { key: "stage", label: "Stage" },
      { key: "approver", label: "Approver" },
      { key: "waitingSince", label: "Waiting since", type: "datetime" },
      { key: "ageDays", label: "Age (days)", type: "number" },
      { key: "dueAt", label: "Due", type: "datetime" },
      { key: "overdue", label: "Overdue" },
    ],
    run: async (p) =>
      query(
        await pool(),
        `SELECT r.request_number AS requestNumber, u.full_name AS requester, u.department, s.name AS stage, ap.full_name AS approver,
                t.created_at AS waitingSince, DATEDIFF(DAY, t.created_at, SYSUTCDATETIME()) AS ageDays, t.due_at AS dueAt,
                CASE WHEN t.due_at < SYSUTCDATETIME() THEN 'Yes' ELSE 'No' END AS overdue
         FROM dbo.approval_tasks t
         JOIN dbo.hardware_requests r ON r.id = t.hardware_request_id
         JOIN dbo.users u ON u.id = r.requester_user_id
         JOIN dbo.users ap ON ap.id = t.approver_user_id
         JOIN dbo.approval_workflow_stages s ON s.id = t.stage_id
         WHERE t.status = @pending AND ${dept("u.department", p)}
         ORDER BY t.created_at`,
        params(p, { pending: APPROVAL_STATUS.PENDING })
      ),
  },
  {
    key: "approval-turnaround",
    title: "Approval turnaround",
    group: "Requests & approvals",
    description: "Average and worst time taken to act on approval tasks, per stage.",
    filters: { dateRange: "Acted", department: true },
    columns: [
      { key: "stage", label: "Stage" },
      { key: "decisions", label: "Decisions", type: "number" },
      { key: "approved", label: "Approved", type: "number" },
      { key: "rejectedOrReturned", label: "Rejected / returned", type: "number" },
      { key: "avgHours", label: "Avg hours", type: "number" },
      { key: "maxHours", label: "Max hours", type: "number" },
      { key: "onTimePct", label: "On time", type: "percent" },
    ],
    run: async (p) =>
      query(
        await pool(),
        `SELECT s.name AS stage, COUNT(*) AS decisions,
                SUM(CASE WHEN t.status = @approved THEN 1 ELSE 0 END) AS approved,
                SUM(CASE WHEN t.status IN (@negative) THEN 1 ELSE 0 END) AS rejectedOrReturned,
                CAST(AVG(DATEDIFF(MINUTE, t.created_at, t.acted_at) / 60.0) AS DECIMAL(10,1)) AS avgHours,
                CAST(MAX(DATEDIFF(MINUTE, t.created_at, t.acted_at) / 60.0) AS DECIMAL(10,1)) AS maxHours,
                CAST(100.0 * SUM(CASE WHEN t.due_at IS NULL OR t.acted_at <= t.due_at THEN 1 ELSE 0 END) / COUNT(*) AS DECIMAL(5,1)) AS onTimePct
         FROM dbo.approval_tasks t
         JOIN dbo.approval_workflow_stages s ON s.id = t.stage_id
         JOIN dbo.hardware_requests r ON r.id = t.hardware_request_id
         JOIN dbo.users u ON u.id = r.requester_user_id
         WHERE t.acted_at IS NOT NULL AND ${range("t.acted_at", p)} AND ${dept("u.department", p)}
         GROUP BY s.name ORDER BY avgHours DESC`,
        params(p, { approved: APPROVAL_STATUS.APPROVED, negative: [APPROVAL_STATUS.REJECTED, APPROVAL_STATUS.RETURNED] })
      ),
  },
  {
    key: "item-demand",
    title: "Item demand",
    group: "Requests & approvals",
    description: "Which item-master items are requested most, and how much has been delivered.",
    filters: { dateRange: "Requested", department: true },
    columns: [
      { key: "itemCode", label: "Code" },
      { key: "itemName", label: "Item" },
      { key: "category", label: "Category" },
      { key: "requests", label: "Requests", type: "number" },
      { key: "requested", label: "Units requested", type: "number" },
      { key: "delivered", label: "Units delivered", type: "number" },
      { key: "estimatedValue", label: "Estimated value", type: "money" },
    ],
    run: async (p) =>
      query(
        await pool(),
        `SELECT COALESCE(im.item_code, '—') AS itemCode, COALESCE(im.item_name, c.name + ' (no item)') AS itemName, c.name AS category,
                COUNT(DISTINCT r.id) AS requests, SUM(i.quantity) AS requested, SUM(i.fulfilled_quantity) AS delivered,
                ${money("SUM(i.quantity * i.estimated_unit_price)")} AS estimatedValue
         FROM dbo.hardware_request_items i
         JOIN dbo.hardware_requests r ON r.id = i.hardware_request_id
         JOIN dbo.users u ON u.id = r.requester_user_id
         JOIN dbo.hardware_categories c ON c.id = i.category_id
         LEFT JOIN dbo.item_master im ON im.id = i.item_id
         WHERE r.status NOT IN (@excluded) AND ${range("r.created_at", p)} AND ${dept("u.department", p)}
         GROUP BY im.item_code, im.item_name, c.name ORDER BY requested DESC`,
        params(p, { excluded: [REQUEST_STATUS.DRAFT, REQUEST_STATUS.CANCELLED, REQUEST_STATUS.REJECTED] })
      ),
  },

  // ── Spend ──
  {
    key: "department-expenditure",
    title: "Department-wise expenditure",
    group: "Spend",
    description: "Purchase orders committed, invoiced and paid per department.",
    permissions: ["finance.budget.manage", "finance.invoice.verify", "finance.invoice.approve", "finance.payment.manage", "procurement.manage"],
    filters: { dateRange: "PO date", department: true },
    columns: [
      { key: "department", label: "Department" },
      { key: "orders", label: "POs", type: "number" },
      { key: "committed", label: "Committed (PO)", type: "money" },
      { key: "invoiced", label: "Invoiced", type: "money" },
      { key: "paid", label: "Paid", type: "money" },
      { key: "outstanding", label: "Outstanding", type: "money" },
    ],
    run: async (p) =>
      query(
        await pool(),
        `SELECT COALESCE(po.department, '(none)') AS department, COUNT(*) AS orders, ${money("SUM(po.total_amount)")} AS committed,
                ${money("SUM(inv.invoiced)")} AS invoiced, ${money("SUM(inv.paid)")} AS paid,
                ${money("SUM(inv.invoiced) - SUM(inv.paid)")} AS outstanding
         FROM dbo.purchase_orders po
         OUTER APPLY (SELECT SUM(i.total_amount) AS invoiced, SUM(i.paid_amount) AS paid FROM dbo.invoices i
                      WHERE i.purchase_order_id = po.id AND i.status <> @rejected) inv
         WHERE po.status IN (@committedStatuses) AND ${range("po.order_date", p)} AND ${dept("po.department", p)}
         GROUP BY po.department ORDER BY SUM(po.total_amount) DESC`,
        params(p, { rejected: INVOICE_STATUS.REJECTED, committedStatuses: COMMITTED_PO })
      ),
  },
  {
    key: "category-expenditure",
    title: "Category-wise expenditure",
    group: "Spend",
    description: "Units ordered and purchase value per asset category.",
    permissions: ["finance.budget.manage", "finance.invoice.verify", "finance.invoice.approve", "finance.payment.manage", "procurement.manage"],
    filters: { dateRange: "PO date", department: true },
    columns: [
      { key: "category", label: "Category" },
      { key: "unitsOrdered", label: "Units ordered", type: "number" },
      { key: "unitsReceived", label: "Units received", type: "number" },
      { key: "value", label: "PO value (incl. tax)", type: "money" },
      { key: "avgUnitPrice", label: "Avg unit price", type: "money" },
    ],
    run: async (p) =>
      query(
        await pool(),
        `SELECT c.name AS category, SUM(x.quantity) AS unitsOrdered, SUM(x.received_quantity) AS unitsReceived,
                ${money("SUM(x.line_total)")} AS value, ${money("SUM(x.quantity * x.unit_price) / NULLIF(SUM(x.quantity), 0)")} AS avgUnitPrice
         FROM dbo.purchase_order_items x
         JOIN dbo.purchase_orders po ON po.id = x.purchase_order_id
         JOIN dbo.hardware_categories c ON c.id = x.category_id
         WHERE po.status IN (@committedStatuses) AND ${range("po.order_date", p)} AND ${dept("po.department", p)}
         GROUP BY c.name ORDER BY SUM(x.line_total) DESC`,
        params(p, { committedStatuses: COMMITTED_PO })
      ),
  },
  {
    key: "vendor-summary",
    title: "Vendor procurement summary",
    group: "Spend",
    description: "Orders, value, on-time delivery and amounts outstanding per vendor.",
    permissions: ["procurement.manage", "finance.invoice.verify", "finance.invoice.approve", "finance.payment.manage"],
    filters: { dateRange: "PO date" },
    columns: [
      { key: "vendor", label: "Vendor" },
      { key: "orders", label: "POs", type: "number" },
      { key: "value", label: "PO value", type: "money" },
      { key: "fullyReceived", label: "Fully received", type: "number" },
      { key: "onTimePct", label: "On-time receipts", type: "percent" },
      { key: "invoiced", label: "Invoiced", type: "money" },
      { key: "outstanding", label: "Outstanding", type: "money" },
    ],
    run: async (p) =>
      query(
        await pool(),
        `SELECT v.name AS vendor, COUNT(*) AS orders, ${money("SUM(po.total_amount)")} AS value,
                SUM(CASE WHEN po.status IN (@done) THEN 1 ELSE 0 END) AS fullyReceived,
                CAST(100.0 * SUM(CASE WHEN g.lastReceipt IS NOT NULL AND (po.expected_date IS NULL OR g.lastReceipt <= po.expected_date) THEN 1 ELSE 0 END)
                     / NULLIF(SUM(CASE WHEN g.lastReceipt IS NOT NULL THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) AS onTimePct,
                ${money("SUM(inv.invoiced)")} AS invoiced, ${money("SUM(inv.invoiced) - SUM(inv.paid)")} AS outstanding
         FROM dbo.purchase_orders po
         JOIN dbo.vendors v ON v.id = po.vendor_id
         OUTER APPLY (SELECT MAX(received_date) AS lastReceipt FROM dbo.goods_receipts WHERE purchase_order_id = po.id) g
         OUTER APPLY (SELECT SUM(i.total_amount) AS invoiced, SUM(i.paid_amount) AS paid FROM dbo.invoices i
                      WHERE i.purchase_order_id = po.id AND i.status <> @rejected) inv
         WHERE po.status IN (@committedStatuses) AND ${range("po.order_date", p)}
         GROUP BY v.name ORDER BY SUM(po.total_amount) DESC`,
        params(p, { done: [PO_STATUS.FULLY_RECEIVED, PO_STATUS.CLOSED], rejected: INVOICE_STATUS.REJECTED, committedStatuses: COMMITTED_PO })
      ),
  },
  {
    key: "invoice-payment-summary",
    title: "Invoice & payment summary",
    group: "Spend",
    description: "Every invoice with what has been paid, what is outstanding and how overdue it is.",
    permissions: ["finance.invoice.verify", "finance.invoice.approve", "finance.payment.manage"],
    filters: { dateRange: "Invoice date", department: true },
    columns: [
      { key: "referenceNumber", label: "Reference" },
      { key: "vendorInvoiceNumber", label: "Vendor invoice" },
      { key: "vendor", label: "Vendor" },
      { key: "poNumber", label: "PO" },
      { key: "invoiceDate", label: "Invoice date", type: "date" },
      { key: "dueDate", label: "Due", type: "date" },
      { key: "total", label: "Total", type: "money" },
      { key: "paid", label: "Paid", type: "money" },
      { key: "outstanding", label: "Outstanding", type: "money" },
      { key: "daysOverdue", label: "Days overdue", type: "number" },
      { key: "status", label: "Status", type: "status" },
    ],
    run: async (p) =>
      query(
        await pool(),
        `SELECT i.reference_number AS referenceNumber, i.vendor_invoice_number AS vendorInvoiceNumber, v.name AS vendor, po.po_number AS poNumber,
                i.invoice_date AS invoiceDate, i.due_date AS dueDate, ${money("i.total_amount")} AS total, ${money("i.paid_amount")} AS paid,
                ${money("i.total_amount - i.paid_amount")} AS outstanding,
                CASE WHEN i.status NOT IN (@settled) AND i.due_date < CAST(SYSUTCDATETIME() AS DATE)
                     THEN DATEDIFF(DAY, i.due_date, SYSUTCDATETIME()) ELSE 0 END AS daysOverdue,
                i.status
         FROM dbo.invoices i JOIN dbo.vendors v ON v.id = i.vendor_id JOIN dbo.purchase_orders po ON po.id = i.purchase_order_id
         WHERE ${range("i.invoice_date", p)} AND ${dept("po.department", p)}
         ORDER BY i.invoice_date DESC, i.id DESC`,
        params(p, { settled: [INVOICE_STATUS.PAID, INVOICE_STATUS.REJECTED] })
      ),
  },

  // ── Inventory & assets ──
  {
    key: "inventory-availability",
    title: "Inventory availability",
    group: "Inventory & assets",
    description: "Stock counters per category and warehouse right now.",
    filters: {},
    columns: [
      { key: "category", label: "Category" },
      { key: "warehouse", label: "Warehouse" },
      { key: "tracking", label: "Tracking" },
      { key: "available", label: "Available", type: "number" },
      { key: "reserved", label: "Reserved", type: "number" },
      { key: "issued", label: "Issued", type: "number" },
      { key: "underRepair", label: "Under repair", type: "number" },
      { key: "damaged", label: "Damaged", type: "number" },
    ],
    run: async () =>
      query(
        await pool(),
        `SELECT c.name AS category, w.name AS warehouse, CASE WHEN c.is_serialized = 1 THEN 'Serialized' ELSE 'Quantity' END AS tracking,
                s.quantity_available AS available, s.quantity_reserved AS reserved, s.quantity_issued AS issued,
                s.quantity_under_repair AS underRepair, s.quantity_damaged AS damaged
         FROM dbo.inventory_stock s JOIN dbo.hardware_categories c ON c.id = s.category_id JOIN dbo.warehouses w ON w.id = s.warehouse_id
         ORDER BY c.name, w.name`
      ),
  },
  {
    key: "stock-ageing",
    title: "Stock ageing",
    group: "Inventory & assets",
    description: "How long available serialized assets have been sitting in store (from purchase or registration date).",
    filters: {},
    columns: [
      { key: "category", label: "Category" },
      { key: "warehouse", label: "Warehouse" },
      { key: "d0_30", label: "0–30 days", type: "number" },
      { key: "d31_90", label: "31–90", type: "number" },
      { key: "d91_180", label: "91–180", type: "number" },
      { key: "d181_365", label: "181–365", type: "number" },
      { key: "d365plus", label: "Over a year", type: "number" },
      { key: "total", label: "Total", type: "number" },
      { key: "value", label: "Book cost", type: "money" },
    ],
    run: async () =>
      query(
        await pool(),
        `WITH a AS (
           SELECT c.name AS category, w.name AS warehouse, a.purchase_cost,
                  DATEDIFF(DAY, COALESCE(CAST(a.purchase_date AS DATETIME2), a.created_at), SYSUTCDATETIME()) AS age
           FROM dbo.assets a JOIN dbo.hardware_categories c ON c.id = a.category_id LEFT JOIN dbo.warehouses w ON w.id = a.warehouse_id
           WHERE a.status = @available)
         SELECT category, COALESCE(warehouse, '—') AS warehouse,
                SUM(CASE WHEN age <= 30 THEN 1 ELSE 0 END) AS d0_30,
                SUM(CASE WHEN age BETWEEN 31 AND 90 THEN 1 ELSE 0 END) AS d31_90,
                SUM(CASE WHEN age BETWEEN 91 AND 180 THEN 1 ELSE 0 END) AS d91_180,
                SUM(CASE WHEN age BETWEEN 181 AND 365 THEN 1 ELSE 0 END) AS d181_365,
                SUM(CASE WHEN age > 365 THEN 1 ELSE 0 END) AS d365plus,
                COUNT(*) AS total, ${money("SUM(purchase_cost)")} AS value
         FROM a GROUP BY category, warehouse ORDER BY category, warehouse`,
        { available: ASSET_STATUS.AVAILABLE }
      ),
  },
  {
    key: "asset-assignments",
    title: "Asset assignment report",
    group: "Inventory & assets",
    description: "Assets issued to employees in the period, with acknowledgement.",
    filters: { dateRange: "Issued", department: true },
    columns: [
      { key: "assetTag", label: "Asset" },
      { key: "category", label: "Category" },
      { key: "model", label: "Model" },
      { key: "employee", label: "Employee" },
      { key: "department", label: "Department" },
      { key: "assignedAt", label: "Issued", type: "datetime" },
      { key: "acknowledgedAt", label: "Acknowledged", type: "datetime" },
      { key: "issuedBy", label: "Issued by" },
      { key: "requestNumber", label: "Request" },
      { key: "current", label: "Still with employee" },
    ],
    run: async (p) =>
      query(
        await pool(),
        `SELECT a.asset_tag AS assetTag, c.name AS category, a.model, u.full_name AS employee, u.department, aa.assigned_at AS assignedAt,
                aa.acknowledged_at AS acknowledgedAt, ib.full_name AS issuedBy, r.request_number AS requestNumber,
                CASE WHEN aa.is_active = 1 THEN 'Yes' ELSE 'No' END AS [current]
         FROM dbo.asset_assignments aa
         JOIN dbo.assets a ON a.id = aa.asset_id JOIN dbo.hardware_categories c ON c.id = a.category_id
         JOIN dbo.users u ON u.id = aa.user_id JOIN dbo.users ib ON ib.id = aa.issued_by_user_id
         LEFT JOIN dbo.hardware_request_items ri ON ri.id = aa.request_item_id
         LEFT JOIN dbo.hardware_requests r ON r.id = ri.hardware_request_id
         WHERE ${range("aa.assigned_at", p)} AND ${dept("u.department", p)}
         ORDER BY aa.assigned_at DESC`,
        params(p)
      ),
  },
  {
    key: "asset-returns",
    title: "Asset return report",
    group: "Inventory & assets",
    description: "Assets returned in the period, with condition and inspection notes.",
    filters: { dateRange: "Returned", department: true },
    columns: [
      { key: "assetTag", label: "Asset" },
      { key: "category", label: "Category" },
      { key: "employee", label: "Returned by" },
      { key: "department", label: "Department" },
      { key: "assignedAt", label: "Issued", type: "date" },
      { key: "returnedAt", label: "Returned", type: "datetime" },
      { key: "daysHeld", label: "Days held", type: "number" },
      { key: "conditionAtIssue", label: "Condition out" },
      { key: "conditionAtReturn", label: "Condition in" },
      { key: "assetStatus", label: "Asset now", type: "status" },
      { key: "inspectionNotes", label: "Inspection notes" },
    ],
    run: async (p) =>
      query(
        await pool(),
        `SELECT a.asset_tag AS assetTag, c.name AS category, u.full_name AS employee, u.department, aa.assigned_at AS assignedAt,
                aa.returned_at AS returnedAt, DATEDIFF(DAY, aa.assigned_at, aa.returned_at) AS daysHeld,
                aa.condition_at_issue AS conditionAtIssue, aa.condition_at_return AS conditionAtReturn, a.status AS assetStatus,
                aa.inspection_notes AS inspectionNotes
         FROM dbo.asset_assignments aa
         JOIN dbo.assets a ON a.id = aa.asset_id JOIN dbo.hardware_categories c ON c.id = a.category_id JOIN dbo.users u ON u.id = aa.user_id
         WHERE aa.returned_at IS NOT NULL AND ${range("aa.returned_at", p)} AND ${dept("u.department", p)}
         ORDER BY aa.returned_at DESC`,
        params(p)
      ),
  },
  {
    key: "warranty-expiry",
    title: "Warranty expiry",
    group: "Inventory & assets",
    description: "Assets whose warranty ends in the period (defaults to the next 90 days), and who holds them.",
    filters: { dateRange: "Warranty ends", department: true },
    columns: [
      { key: "assetTag", label: "Asset" },
      { key: "category", label: "Category" },
      { key: "model", label: "Model" },
      { key: "serialNumber", label: "Serial" },
      { key: "status", label: "Status", type: "status" },
      { key: "holder", label: "Held by" },
      { key: "department", label: "Department" },
      { key: "warrantyEndDate", label: "Warranty ends", type: "date" },
      { key: "daysLeft", label: "Days left", type: "number" },
    ],
    run: async (p) => {
      const from = p.from ?? new Date(new Date().toISOString().slice(0, 10));
      const to = p.toExclusive ?? new Date(from.getTime() + 91 * 86_400_000);
      return query(
        await pool(),
        `SELECT a.asset_tag AS assetTag, c.name AS category, a.model, a.serial_number AS serialNumber, a.status,
                u.full_name AS holder, u.department, a.warranty_end_date AS warrantyEndDate,
                DATEDIFF(DAY, CAST(SYSUTCDATETIME() AS DATE), a.warranty_end_date) AS daysLeft
         FROM dbo.assets a JOIN dbo.hardware_categories c ON c.id = a.category_id
         LEFT JOIN dbo.asset_assignments aa ON aa.asset_id = a.id AND aa.is_active = 1
         LEFT JOIN dbo.users u ON u.id = aa.user_id
         WHERE a.warranty_end_date >= @from AND a.warranty_end_date < @to AND a.status NOT IN (@gone) AND ${dept("u.department", p)}
         ORDER BY a.warranty_end_date`,
        { from, to, department: p.department, gone: [ASSET_STATUS.RETIRED, ASSET_STATUS.DISPOSED] }
      );
    },
  },

  // ── Maintenance ──
  {
    key: "maintenance-history",
    title: "Maintenance history",
    group: "Maintenance",
    description: "Tickets raised in the period with resolution time, SLA result and repair cost.",
    filters: { dateRange: "Reported", department: true },
    columns: [
      { key: "ticketNumber", label: "Ticket" },
      { key: "title", label: "Issue" },
      { key: "assetTag", label: "Asset" },
      { key: "reporter", label: "Reported by" },
      { key: "department", label: "Department" },
      { key: "priority", label: "Priority" },
      { key: "status", label: "Status", type: "status" },
      { key: "technician", label: "Technician" },
      { key: "createdAt", label: "Reported", type: "datetime" },
      { key: "resolutionHours", label: "Hours to resolve", type: "number" },
      { key: "sla", label: "SLA" },
      { key: "repeat", label: "Repeat" },
      { key: "partsCost", label: "Parts cost", type: "money" },
    ],
    run: async (p) =>
      query(
        await pool(),
        `SELECT t.ticket_number AS ticketNumber, t.title, a.asset_tag AS assetTag, rb.full_name AS reporter, rb.department, t.priority, t.status,
                tech.full_name AS technician, t.created_at AS createdAt,
                CAST(DATEDIFF(MINUTE, t.created_at, t.resolved_at) / 60.0 AS DECIMAL(10,1)) AS resolutionHours,
                CASE WHEN COALESCE(t.resolved_at, SYSUTCDATETIME()) > t.sla_due_at THEN 'Breached'
                     WHEN t.resolved_at IS NULL THEN 'Open' ELSE 'Met' END AS sla,
                CASE WHEN t.is_repeat = 1 THEN 'Yes' ELSE 'No' END AS [repeat],
                ${money("(SELECT SUM(quantity * unit_cost) FROM dbo.maintenance_parts WHERE ticket_id = t.id)")} AS partsCost
         FROM dbo.maintenance_tickets t
         JOIN dbo.users rb ON rb.id = t.reported_by_user_id
         LEFT JOIN dbo.users tech ON tech.id = t.assigned_to_user_id
         LEFT JOIN dbo.assets a ON a.id = t.asset_id
         WHERE ${range("t.created_at", p)} AND ${dept("rb.department", p)}
         ORDER BY t.created_at DESC`,
        params(p)
      ),
  },
  {
    key: "maintenance-sla",
    title: "Maintenance SLA by technician",
    group: "Maintenance",
    description: "Workload and SLA performance per technician.",
    filters: { dateRange: "Reported" },
    columns: [
      { key: "technician", label: "Technician" },
      { key: "tickets", label: "Tickets", type: "number" },
      { key: "open", label: "Open", type: "number" },
      { key: "resolved", label: "Resolved", type: "number" },
      { key: "avgHours", label: "Avg hours to resolve", type: "number" },
      { key: "slaMetPct", label: "SLA met", type: "percent" },
      { key: "partsCost", label: "Parts cost", type: "money" },
    ],
    run: async (p) =>
      query(
        await pool(),
        `SELECT COALESCE(tech.full_name, '(unassigned)') AS technician, COUNT(*) AS tickets,
                SUM(CASE WHEN t.status IN (@open) THEN 1 ELSE 0 END) AS [open],
                SUM(CASE WHEN t.resolved_at IS NOT NULL THEN 1 ELSE 0 END) AS resolved,
                CAST(AVG(CASE WHEN t.resolved_at IS NOT NULL THEN DATEDIFF(MINUTE, t.created_at, t.resolved_at) / 60.0 END) AS DECIMAL(10,1)) AS avgHours,
                CAST(100.0 * SUM(CASE WHEN t.resolved_at IS NOT NULL AND t.resolved_at <= t.sla_due_at THEN 1 ELSE 0 END)
                     / NULLIF(SUM(CASE WHEN t.resolved_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS DECIMAL(5,1)) AS slaMetPct,
                ${money("SUM(pc.cost)")} AS partsCost
         FROM dbo.maintenance_tickets t LEFT JOIN dbo.users tech ON tech.id = t.assigned_to_user_id
         OUTER APPLY (SELECT SUM(quantity * unit_cost) AS cost FROM dbo.maintenance_parts WHERE ticket_id = t.id) pc
         WHERE ${range("t.created_at", p)}
         GROUP BY tech.full_name ORDER BY tickets DESC`,
        params(p, { open: OPEN_TICKETS })
      ),
  },

  // ── Administration ──
  {
    key: "audit-activity",
    title: "Audit activity",
    group: "Administration",
    description: "What changed in the period: number of audited actions by type and how many people did them.",
    permissions: ["audit.view"],
    filters: { dateRange: "When" },
    columns: [
      { key: "action", label: "Action" },
      { key: "entityType", label: "Record type" },
      { key: "events", label: "Events", type: "number" },
      { key: "actors", label: "People", type: "number" },
      { key: "lastAt", label: "Last", type: "datetime" },
    ],
    run: async (p) =>
      query(
        await pool(),
        `SELECT l.[action], l.entity_type AS entityType, COUNT(*) AS events, COUNT(DISTINCT l.actor_user_id) AS actors, MAX(l.created_at) AS lastAt
         FROM dbo.audit_logs l WHERE ${range("l.created_at", p)}
         GROUP BY l.[action], l.entity_type ORDER BY events DESC`,
        params(p)
      ),
  },
];

function canRun(user: AuthUser, r: ReportDef) {
  if (!user.permissions.includes("reports.view")) return false;
  return !r.permissions || r.permissions.some((p) => user.permissions.includes(p));
}

export function listReports(user: AuthUser) {
  return REPORTS.filter((r) => canRun(user, r)).map(({ run: _run, ...meta }) => meta);
}

export async function runReport(user: AuthUser, key: string, p: ReportParams) {
  const r = REPORTS.find((x) => x.key === key);
  if (!r) throw notFound("Report");
  if (!canRun(user, r)) throw forbidden("You do not have access to this report");
  const rows = await r.run({ from: r.filters.dateRange ? p.from : null, toExclusive: r.filters.dateRange ? p.toExclusive : null, department: r.filters.department ? p.department : null });
  const { run: _run, ...meta } = r;
  return { ...meta, rows, generatedAt: new Date().toISOString() };
}
