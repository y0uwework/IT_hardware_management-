// SELECT-list fragments: snake_case columns → the camelCase fields the API returns.
//
//   `SELECT ${assetCols("a")} ...`               →  a.[asset_tag] AS [assetTag], ...
//   `SELECT ${categoryCols("c", "category.")}`   →  c.[name] AS [category.name]  (nested by lib/db)
//
// A spec value containing "$" is an expression; "$" is replaced with the table alias.
// DECIMAL columns are returned as strings, exactly as the API has always sent them.

type Spec = Record<string, string>;

function cols(spec: Spec) {
  return (alias: string, prefix = "") =>
    Object.entries(spec)
      .map(([field, col]) => `${col.includes("$") ? col.replaceAll("$", alias) : `${alias}.[${col}]`} AS [${prefix}${field}]`)
      .join(", ");
}

const decimal = (column: string) => `CONVERT(NVARCHAR(40), $.[${column}])`;

export const permissionCols = cols({
  id: "id",
  permissionKey: "permission_key",
  module: "module",
  description: "description",
  createdAt: "created_at",
  updatedAt: "updated_at",
});

export const categoryCols = cols({
  id: "id",
  code: "code",
  name: "name",
  description: "description",
  isSerialized: "is_serialized",
  isActive: "is_active",
  createdAt: "created_at",
});

export const itemMasterCols = cols({
  id: "id",
  code: "item_code",
  name: "item_name",
  categoryId: "category_id",
  itemType: "item_type",
  manufacturer: "manufacturer",
  model: "model",
  partNumber: "part_number",
  description: "description",
  unitOfMeasure: "unit_of_measure",
  hsnCode: "hsn_code",
  standardCost: decimal("standard_cost"),
  warrantyMonths: "warranty_months",
  reorderLevel: "reorder_level",
  isActive: "is_active",
  createdAt: "created_at",
  updatedAt: "updated_at",
});

export const warehouseCols = cols({
  id: "id",
  code: "code",
  name: "name",
  location: "location",
  isActive: "is_active",
  createdAt: "created_at",
});

export const requestCols = cols({
  id: "id",
  requestNumber: "request_number",
  requesterUserId: "requester_user_id",
  requestType: "request_type",
  purpose: "purpose",
  justification: "justification",
  priority: "priority",
  requiredDate: "required_date",
  costCentre: "cost_centre",
  status: "status",
  workflowId: "workflow_id",
  submittedAt: "submitted_at",
  createdAt: "created_at",
  updatedAt: "updated_at",
});

export const itemCols = cols({
  id: "id",
  hardwareRequestId: "hardware_request_id",
  categoryId: "category_id",
  itemId: "item_id",
  quantity: "quantity",
  requestedSpecification: "requested_specification",
  approvedSpecification: "approved_specification",
  estimatedUnitPrice: decimal("estimated_unit_price"),
  fulfilledQuantity: "fulfilled_quantity",
  procurementQuantity: "procurement_quantity",
  fulfilmentStatus: "fulfilment_status",
  itReviewComments: "it_review_comments",
  reviewedByUserId: "reviewed_by_user_id",
  reviewedAt: "reviewed_at",
});

export const workflowCols = cols({
  id: "id",
  workflowKey: "workflow_key",
  name: "name",
  version: "version",
  requestType: "request_type",
  department: "department",
  minAmount: decimal("min_amount"),
  maxAmount: decimal("max_amount"),
  priority: "priority",
  isActive: "is_active",
  createdByUserId: "created_by_user_id",
  createdAt: "created_at",
});

export const stageCols = cols({
  id: "id",
  workflowId: "workflow_id",
  stageOrder: "stage_order",
  name: "name",
  approverType: "approver_type",
  roleKey: "role_key",
  dueDays: "due_days",
});

export const taskCols = cols({
  id: "id",
  hardwareRequestId: "hardware_request_id",
  stageId: "stage_id",
  approverUserId: "approver_user_id",
  cycle: "cycle",
  status: "status",
  dueAt: "due_at",
  actedAt: "acted_at",
  comments: "comments",
  delegatedFromUserId: "delegated_from_user_id",
  createdAt: "created_at",
});

export const historyCols = cols({
  id: "id",
  hardwareRequestId: "hardware_request_id",
  taskId: "task_id",
  stageName: "stage_name",
  workflowVersion: "workflow_version",
  actorUserId: "actor_user_id",
  action: "action",
  comments: "comments",
  createdAt: "created_at",
});

export const stockCols = cols({
  id: "id",
  categoryId: "category_id",
  warehouseId: "warehouse_id",
  quantityAvailable: "quantity_available",
  quantityReserved: "quantity_reserved",
  quantityIssued: "quantity_issued",
  quantityDamaged: "quantity_damaged",
  quantityUnderRepair: "quantity_under_repair",
  updatedAt: "updated_at",
});

export const reservationCols = cols({
  id: "id",
  requestItemId: "request_item_id",
  categoryId: "category_id",
  warehouseId: "warehouse_id",
  assetId: "asset_id",
  quantity: "quantity",
  status: "status",
  expiresAt: "expires_at",
  createdByUserId: "created_by_user_id",
  createdAt: "created_at",
  closedAt: "closed_at",
});

export const movementCols = cols({
  id: "id",
  categoryId: "category_id",
  warehouseId: "warehouse_id",
  assetId: "asset_id",
  movementType: "movement_type",
  quantity: "quantity",
  reason: "reason",
  referenceType: "reference_type",
  referenceId: "reference_id",
  createdByUserId: "created_by_user_id",
  createdAt: "created_at",
});

export const assetCols = cols({
  id: "id",
  assetTag: "asset_tag",
  serialNumber: "serial_number",
  categoryId: "category_id",
  manufacturer: "manufacturer",
  model: "model",
  specification: "specification",
  purchaseDate: "purchase_date",
  purchaseCost: decimal("purchase_cost"),
  warrantyEndDate: "warranty_end_date",
  warehouseId: "warehouse_id",
  condition: "condition",
  status: "status",
  notes: "notes",
  createdByUserId: "created_by_user_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
});

export const assignmentCols = cols({
  id: "id",
  assetId: "asset_id",
  userId: "user_id",
  requestItemId: "request_item_id",
  assignedAt: "assigned_at",
  conditionAtIssue: "condition_at_issue",
  accessories: "accessories",
  issueNotes: "issue_notes",
  issuedByUserId: "issued_by_user_id",
  acknowledgedAt: "acknowledged_at",
  returnedAt: "returned_at",
  conditionAtReturn: "condition_at_return",
  returnAccessories: "return_accessories",
  inspectionNotes: "inspection_notes",
  returnedToUserId: "returned_to_user_id",
  isActive: "is_active",
});

export const notificationCols = cols({
  id: "id",
  recipientUserId: "recipient_user_id",
  eventType: "event_type",
  title: "title",
  body: "body",
  link: "link",
  readAt: "read_at",
  createdAt: "created_at",
});

export const auditLogCols = cols({
  id: "id",
  actorUserId: "actor_user_id",
  action: "action",
  entityType: "entity_type",
  entityId: "entity_id",
  beforeJson: "before_json",
  afterJson: "after_json",
  correlationId: "correlation_id",
  createdAt: "created_at",
});
