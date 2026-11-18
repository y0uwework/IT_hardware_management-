# Asset Request Workflow: Build Specification

This document turns the Asset Request flowchart into a step-by-step specification for building the application. Every step, decision and path in the flowchart is covered below.

---

## 1. Actors and Roles

| Actor | Responsibility |
|---|---|
| **Employee** | Raises the request, resubmits returned requests, acknowledges receipt |
| **System** | Loads role and permissions, validates input, issues request numbers, updates lifecycle and history |
| **Workflow Engine** | Reads the active workflow definition and creates approval tasks |
| **Reporting Manager** | First-level approver (approve / reject / return) |
| **IT Admin** | IT review, stock check, reservation, asset assignment |
| **IT / Inventory** | Stock check, stock reservation, goods receipt |
| **Procurement** | Purchase intent, quotations, vendor selection, PO creation, goods receipt, reserving received units |
| **PO Approver** | A separate authorized user (not the PO creator) who approves purchase orders |

---

## 2. Request Status Lifecycle

```
DRAFT -> SUBMITTED -> PENDING_APPROVAL -> APPROVED -> STOCK_CHECK
   ^                       |                              |
   |                       +-> REJECTED (closed)          +-> RESERVED (full or partial)
   +---- RETURNED <--------+                              |        |
                                                          |        +-> ASSIGNED -> ACKNOWLEDGED -> CLOSED
                                                          |
                                                          +-> PROCUREMENT_IN_PROGRESS -> (units received & reserved) -> ASSIGNED
```

Suggested statuses: `DRAFT`, `SUBMITTED`, `PENDING_APPROVAL`, `RETURNED`, `REJECTED`, `APPROVED`, `STOCK_CHECK`, `PARTIALLY_RESERVED`, `RESERVED`, `PROCUREMENT_IN_PROGRESS`, `ASSIGNED`, `ACKNOWLEDGED`, `CLOSED`.

---

## 3. Step-by-Step Flow

### Step 0: Start
- **Trigger:** An employee has a need for an asset.

### Step 1: Sign in and open request (Employee)
- Employee signs in.
- **System loads role and permissions.**
- Items to request are picked from the **Item Master** (no free-text items).
- A new request opens in `DRAFT`.

### Step 2: Enter details and submit (Employee, System)
- **Employee enters:**
  - Item (from Item Master)
  - Quantity
  - Specifications
  - Required date
  - Reason / justification
- **System validates** all fields (required fields, quantity > 0, date not in the past, item is active, and so on).
- **System issues a unique request number** (for example `AR-2026-000123`).
- Status moves to `SUBMITTED`.

### Step 3: Route for approval (Workflow Engine)
- The engine **reads the active workflow** for this request (by item category, department, value and so on).
- It **creates the first approval task** for the reporting manager or the configured role.
- Status moves to `PENDING_APPROVAL`.

### Step 4: Approval decision

> **DECISION: Approve, reject or return?**

Approvers are the **Reporting Manager** and the **IT Admin (IT review)**. The IT review checks specs, quantity, warehouse, and whether the request can be fulfilled. **IT can also reject or return.**

| Outcome | Result |
|---|---|
| **Approved** | The request proceeds to the next approval task, or to Step 6 (Stock check) once all required approvals are complete |
| **Rejected** | Go to Step 5 (reject) |
| **Returned** | Go to Step 5 (return) |

### Step 5: Rejected / returned (Approver)
- **Reject:** The request is **closed with a mandatory reason**. Status is `REJECTED`, then **End**.
- **Return:** The request goes **back to the employee for resubmission** with comments. Status is `RETURNED`.
  - The employee **corrects and resubmits**, which goes back to **Step 2** (same request number, with version/history retained).
  - The approval chain restarts from the first task.

### Step 6: Stock check (IT Admin / Inventory)

> **DECISION: Is the required quantity available?**

| Answer | Path |
|---|---|
| **Yes / partial** | Go to Step 7 (Reserve available stock). If only part is available, also start the Procurement Path (Section 4) for the shortfall. |
| **No / shortfall** | Go to the Procurement Path (Section 4) for the unavailable quantity |

### Step 7: Reserve available stock (IT / Inventory)
- Available units are **reserved against the request**.
- **Partial reservation is allowed.**
- Reserved units cannot be reserved by another request.

### Step 8: Assign asset (IT Admin)
- **Available or newly received units** are assigned to the employee.
- Serialized assets are linked to the employee by serial/asset tag.
- Consumables are issued as quantity.

### Step 9: Acknowledge receipt (Employee)
- The employee **confirms receipt in My Assets**.
- **Lifecycle and assignment history are updated** (who, what, when, from which request).
- Status moves to `ACKNOWLEDGED`, then `CLOSED`.

### Step 10: End

---

## 4. Procurement Path (only for the unavailable quantity)

This path is triggered by a **No / shortfall** stock check. It covers **only the quantity that is not available**. Any reserved portion continues through assignment independently.

### 4.1 Purchase intent (Procurement)
- Record **item, quantity and source request** for the unavailable quantity.

### 4.2 Quotations (Procurement)
- **Collect quotations from vendors** for the requested items.

### 4.3 Vendor selection (Procurement)
- **Compare vendor quotes** (vendor comparison and selection screen) and **select the vendor**.

### 4.4 PO approval (Procurement, department purchase)
- **Create the PO** (department purchase).
- **A separate authorized user approves it** (the creator cannot approve their own PO).
- Decision:
  - **Approved:** continue to Goods receipt.
  - **Reject / return:** if rejected, the PO is closed. If returned, **correct and resubmit**.

### 4.5 Goods receipt (Procurement / Inventory)
- **Record accepted quantity.**
- **Serialized assets:** register each unit (serial number, asset tag).
- **Consumables:** add to stock quantity.

### 4.6 Reserve received units (Procurement)
- Units **bought for this request are reserved against it**.
- Then go to **Step 8: Assign asset**, then Acknowledge receipt, then End.

---

## 5. Business Rules

1. Items can only be selected from the **Item Master**.
2. Every request gets a **unique, system-generated request number**.
3. The approval route comes from the **active workflow configuration**, not hard-coded logic.
4. **Reject requires a reason.** Return requires comments.
5. A returned request keeps its history and goes back through approval after resubmission.
6. **Partial fulfilment is supported:** reserve what is in stock and procure only the shortfall.
7. **Segregation of duties:** the PO creator and PO approver must be different users.
8. Procurement is linked to the **source request**, so received units are reserved to the right request.
9. Serialized assets are registered **individually**. Consumables are tracked by **quantity**.
10. Every state change is written to an **audit/history log** (who, what, when, comment).
11. Access to each screen and action is controlled by **role and permission**.

---

## 6. Suggested Data Model

| Entity | Key fields |
|---|---|
| `User` | id, name, role, manager_id, department |
| `ItemMaster` | id, name, category, type (serialized / consumable), active |
| `AssetRequest` | id, request_no, requester_id, status, reason, required_date, created_at |
| `AssetRequestLine` | request_id, item_id, qty, specs, reserved_qty, assigned_qty |
| `WorkflowDefinition` | id, name, conditions, steps[] |
| `ApprovalTask` | id, request_id, approver_id/role, step_no, decision, comment, decided_at |
| `StockLevel` | item_id, warehouse_id, on_hand, reserved |
| `Reservation` | id, request_id, item_id, qty, source (stock / procurement) |
| `PurchaseIntent` | id, request_id, item_id, qty, status |
| `Quotation` | id, intent_id, vendor_id, price, validity, selected |
| `Vendor` | id, name, contact |
| `PurchaseOrder` | id, po_no, vendor_id, created_by, approved_by, status |
| `GoodsReceipt` | id, po_id, accepted_qty, received_at |
| `Asset` | id, asset_tag, serial_no, item_id, status, current_holder_id |
| `AssignmentHistory` | asset_id, employee_id, request_id, assigned_at, acknowledged_at |
| `AuditLog` | entity, entity_id, action, actor_id, timestamp, comment |

---

## 7. Screens to Build

1. **Login**
2. **New Request:** item picker, quantity, specs, date, reason
3. **My Requests:** list and status tracking
4. **My Assets:** assigned assets and receipt acknowledgement
5. **Approval Inbox:** approve, reject or return with comment
6. **IT Review:** specs, quantity, warehouse and fulfilment check
7. **Stock and Reservation:** availability, reserve and partial reserve
8. **Assignment:** assign units to the employee
9. **Procurement:** purchase intent, quotations, vendor comparison and selection
10. **PO Management:** create, approve and track POs
11. **Goods Receipt:** accepted quantity and asset registration
12. **Admin:** Item Master, workflows, roles and permissions, vendors, warehouses

---

## 8. Notifications

| Event | Notify |
|---|---|
| Request submitted | Approver |
| Approved, rejected or returned | Employee |
| Stock reserved | Employee, IT |
| Shortfall sent to procurement | Procurement |
| PO awaiting approval | PO Approver |
| Goods received | Requesting employee, IT |
| Asset assigned | Employee (to acknowledge) |

---

## 9. Suggested API Endpoints (REST)

```
POST   /requests                       create and submit a request
GET    /requests/:id                   view a request
POST   /requests/:id/resubmit          resubmit a returned request
GET    /approvals/inbox                my pending approval tasks
POST   /approvals/:taskId/decision     { decision: approve|reject|return, comment }
POST   /requests/:id/stock-check       run or record the stock check
POST   /requests/:id/reservations      reserve available stock (partial allowed)
POST   /requests/:id/assign            assign units to the employee
POST   /requests/:id/acknowledge       employee confirms receipt
POST   /procurement/intents            record purchase intent for the shortfall
POST   /procurement/intents/:id/quotations
POST   /procurement/intents/:id/select-vendor
POST   /purchase-orders                create a PO
POST   /purchase-orders/:id/decision   approve | reject | return
POST   /purchase-orders/:id/receipts   goods receipt
POST   /requests/:id/reserve-received  reserve received units to the request
GET    /my-assets                      assets held by the current user
```

---

## 10. Flow Summary (Text Diagram)

```
Start -> Sign in & open request -> Enter details & submit -> Route for approval
      -> [Approve / Reject / Return?]
            |- Reject -> Close with reason -> End
            |- Return -> Employee corrects & resubmits -> (back to Enter details)
            '- Approve -> [Required qty available?]
                  |- Yes/partial -> Reserve available stock -> Assign asset
                  |                  -> Acknowledge receipt -> End
                  '- No/shortfall -> Purchase intent -> Quotations -> Vendor selection
                                     -> Create PO -> [PO approved?]
                                           |- Reject/Return -> close or correct & resubmit
                                           '- Approved -> Goods receipt
                                                -> Reserve received units -> Assign asset
                                                -> Acknowledge receipt -> End
```
