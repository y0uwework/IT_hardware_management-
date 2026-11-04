 
# Hardware Management System — Application Blueprint

**Version:** 2.0  
**Status:** Updated implementation blueprint  
**Organization size:** 500–2,000 employees  
**Frontend and backend:** Next.js + TypeScript  
**Routing:** Next.js Pages Router  
**UI:** Tailwind CSS + reusable shared components  
**Database:** Microsoft SQL Server  
**ORM and migrations:** Prisma (SQL Server provider; pin and validate the selected version)  
**Hosting:** Organization-managed on-premise infrastructure  
**Client:** Responsive web application

---

# 1. Project Overview

The Hardware Management System (HMS) manages the complete lifecycle of organizational hardware, from an employee's initial request through approval, inventory checking, procurement, receipt, asset assignment, maintenance, and eventual return or retirement.

The application will be developed as a **Next.js full-stack modular monolith** using TypeScript.

The system will provide separate experiences for:

- Employees
- Reporting Managers
- Department Heads
- HR
- IT Administrators
- IT Technicians
- Inventory Managers
- Procurement Officers
- Finance Officers
- Auditors
- System Administrators

## 1.1 Core objectives

1. Allow employees to request hardware.
2. Route requests through configurable approval workflows.
3. Allow IT to review technical requirements and check stock.
4. Fulfil requests using available inventory or new procurement.
5. Track vendors, quotations, purchase orders, receipts, invoices and payments.
6. Maintain a complete asset register.
7. Track asset assignment, acknowledgement, transfer, return and retirement.
8. Manage hardware repair and maintenance.
9. Provide dashboards, reports and audit history.
10. Enforce permission-based access throughout the application.

## 1.2 Confirmed technology decisions

| Area | Technology / Decision |
|---|---|
| Framework | Next.js |
| Language | TypeScript |
| Routing | Pages Router |
| Frontend styling | Tailwind CSS |
| UI architecture | Reusable shared components |
| Backend | Next.js API Routes |
| Database | Microsoft SQL Server |
| ORM | Prisma with SQL Server provider |
| Database migrations | Prisma migration workflow |
| Migration command | `npm run migrate` |
| Permission definitions | `config/permissions.config.ts` |
| Permission database synchronization | `npm run seed` |
| Sidebar definitions | `config/sidebar.config.ts` |
| Authentication | Reuse existing authentication |
| Employee source | Existing `users` table |
| Deployment | On-premise |
| Architecture | Modular monolith |

---

# 2. Non-Negotiable Design Rules

## 2.1 Existing users table is the employee master

The organization already has a `users` table containing employee information.

**Do not create an `employees` table. Do not duplicate employee master data.**

All employee-related relationships must reference the existing `users` table.

Examples:

- `hardware_requests.requester_user_id`
- `approval_tasks.approver_user_id`
- `approval_history.actor_user_id`
- `asset_assignments.user_id`
- `maintenance_tickets.assigned_to_user_id`
- `notifications.recipient_user_id`
- `created_by_user_id`
- `updated_by_user_id`

Before implementing migrations, inspect the actual SQL Server schema and confirm:

1. The exact primary-key column of `users`.
2. The SQL Server data type of that primary key.
3. Whether the key is an identity column.
4. Employee name and employee code fields.
5. Department, designation, location and manager relationships.
6. Active/inactive employee status representation.
7. Existing authentication and session implementation.
8. Existing role and permission tables.

Every foreign key referencing `users` must use the exact compatible SQL Server type of the real primary key.

For example, if `users.id` is `INT`, do not define a related field as `BIGINT`. If it is `UNIQUEIDENTIFIER`, use that type consistently.

If existing authentication or RBAC tables already exist, reuse or extend them instead of creating duplicates.

## 2.2 General application rules

- Use a modular monolith for the initial implementation.
- Keep business logic outside React page components and API route handlers.
- Use database transactions for multi-table operations.
- Check inventory before initiating procurement.
- Support partial fulfilment of multi-item requests.
- Keep approval, procurement, invoice verification and payment as distinct business events.
- Preserve historical asset assignments and approvals.
- Enforce permissions on the server.
- Never rely on hiding a button as the only security control.
- Use configurable workflows rather than hard-coded approval chains.
- Use database migrations for every schema change.
- Never destructively modify existing employee or authentication data.

---

# 3. System Architecture

## 3.1 Architecture overview

The application uses Next.js for both the user interface and server-side API layer.

```text
Employee / Manager / IT / Finance / Admin
                    |
                    v
             Next.js Application
                    |
        +-----------+-----------+
        |                       |
        v                       v
   Pages Router            API Routes
   pages/*.tsx              pages/api/*
        |                       |
        v                       v
 Shared Components       Authentication
 Tailwind CSS            Authorization
 Sidebar                 Request Validation
 Forms                   Controllers
 Tables                  Services
 Dashboards              Business Logic
                                |
                                v
                         Prisma ORM
                                |
                                v
                      Microsoft SQL Server
                                |
                 +--------------+--------------+
                 |              |              |
                 v              v              v
              Database       File Storage    Background
              Tables         (Private)       Jobs / Email
```

## 3.2 Application layers

### Presentation layer

Responsible for:

- Pages and layouts
- Forms
- Tables
- Dashboard cards
- Sidebar navigation
- Modals and drawers
- Filters
- Loading and error states

### API layer

Responsible for:

- Authentication checks
- Permission checks
- Request validation
- Calling application services
- Returning consistent responses

### Service layer

Responsible for business rules:

- Request creation
- Approval execution
- Inventory reservations
- Asset assignment
- Procurement
- Invoice verification
- Payment recording
- Maintenance workflows

### Data access layer

Responsible for:

- Prisma queries
- SQL Server transactions
- Database relationships
- Filtering and pagination
- Consistent data access patterns

### Configuration layer

Responsible for:

- Permission catalogue
- Sidebar navigation
- Application constants
- Workflow defaults
- Status definitions

---

# 4. Recommended Project Structure

Use the Next.js Pages Router. Do not use the App Router for this implementation unless the project requirements are explicitly changed.

```text
hardware-management-system/
│
├── components/
│   ├── common/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Textarea.tsx
│   │   ├── Modal.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── DataTable.tsx
│   │   ├── Pagination.tsx
│   │   ├── SearchInput.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── DatePicker.tsx
│   │   ├── FileUpload.tsx
│   │   └── LoadingSpinner.tsx
│   │
│   ├── layout/
│   │   ├── MainLayout.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   ├── Breadcrumb.tsx
│   │   └── PageHeader.tsx
│   │
│   ├── forms/
│   ├── dashboard/
│   ├── requests/
│   ├── approvals/
│   ├── inventory/
│   ├── assets/
│   ├── procurement/
│   └── finance/
│
├── pages/
│   ├── _app.tsx
│   ├── _document.tsx
│   ├── index.tsx
│   ├── login.tsx
│   │
│   ├── dashboard/
│   │   ├── index.tsx
│   │   ├── employee.tsx
│   │   ├── manager.tsx
│   │   ├── it.tsx
│   │   ├── procurement.tsx
│   │   └── finance.tsx
│   │
│   ├── requests/
│   │   ├── index.tsx
│   │   ├── create.tsx
│   │   ├── [id].tsx
│   │   └── [id]/
│   │       └── edit.tsx
│   │
│   ├── approvals/
│   │   ├── index.tsx
│   │   └── [id].tsx
│   │
│   ├── inventory/
│   │   ├── index.tsx
│   │   ├── stock.tsx
│   │   ├── movements.tsx
│   │   └── reservations.tsx
│   │
│   ├── assets/
│   │   ├── index.tsx
│   │   ├── create.tsx
│   │   ├── [id].tsx
│   │   ├── assignments.tsx
│   │   └── returns.tsx
│   │
│   ├── procurement/
│   │   ├── vendors.tsx
│   │   ├── quotations.tsx
│   │   ├── purchase-orders.tsx
│   │   └── goods-receipts.tsx
│   │
│   ├── finance/
│   │   ├── budgets.tsx
│   │   ├── invoices.tsx
│   │   └── payments.tsx
│   │
│   ├── maintenance/
│   │   ├── index.tsx
│   │   └── [id].tsx
│   │
│   ├── reports/
│   │   └── index.tsx
│   │
│   ├── admin/
│   │   ├── roles.tsx
│   │   ├── users.tsx
│   │   ├── workflows.tsx
│   │   ├── master-data.tsx
│   │   └── audit-logs.tsx
│   │
│   └── api/
│       ├── auth/
│       ├── me/
│       ├── dashboard/
│       ├── users/
│       ├── hardware-requests/
│       ├── approvals/
│       ├── inventory/
│       ├── assets/
│       ├── assignments/
│       ├── vendors/
│       ├── procurement/
│       ├── purchase-orders/
│       ├── goods-receipts/
│       ├── invoices/
│       ├── payments/
│       ├── maintenance-tickets/
│       ├── notifications/
│       ├── reports/
│       └── admin/
│
├── config/
│   ├── permissions.config.ts
│   ├── sidebar.config.ts
│   ├── app.config.ts
│   └── status.config.ts
│
├── lib/
│   ├── prisma.ts
│   ├── auth.ts
│   ├── session.ts
│   ├── validation.ts
│   ├── api-response.ts
│   ├── logger.ts
│   └── constants.ts
│
├── server/
│   ├── middleware/
│   │   ├── authenticate.ts
│   │   └── authorize.ts
│   │
│   ├── services/
│   │   ├── request.service.ts
│   │   ├── approval.service.ts
│   │   ├── inventory.service.ts
│   │   ├── asset.service.ts
│   │   ├── assignment.service.ts
│   │   ├── procurement.service.ts
│   │   ├── finance.service.ts
│   │   ├── maintenance.service.ts
│   │   └── notification.service.ts
│   │
│   ├── repositories/
│   ├── validators/
│   └── utils/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── styles/
│   └── globals.css
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── public/
├── .env
├── .env.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

The structure can be adjusted to fit the existing repository, but the separation between pages, components, configuration, services and database access should remain.

---

# 5. Authentication, Roles and Permissions

## 5.1 Permission architecture

Permission definitions must be maintained in a source-controlled configuration file:

`config/permissions.config.ts`

The database stores the permission catalogue and role assignments.

The configuration file is the source of truth for which permission keys exist. The database determines which roles receive those permissions and which roles are assigned to users.

The seed process synchronizes the permission catalogue. It must not automatically grant every permission to every role.

## 5.2 Permission configuration example

```ts
// config/permissions.config.ts

export const permissions = [
  {
    key: "dashboard.view",
    module: "Dashboard",
    description: "View application dashboard",
  },

  {
    key: "employee.view",
    module: "Employee",
    description: "View authorized existing user records",
  },

  {
    key: "add.employee",
    module: "Employee",
    description: "Create or onboard employee records",
  },

  {
    key: "request.create",
    module: "Requests",
    description: "Create hardware requests",
  },

  {
    key: "request.view",
    module: "Requests",
    description: "View authorized hardware requests",
  },

  {
    key: "request.approve",
    module: "Approvals",
    description: "Approve hardware requests",
  },

  {
    key: "approve.button",
    module: "Approvals",
    description: "Display approval action where authorized",
  },

  {
    key: "inventory.view",
    module: "Inventory",
    description: "View inventory",
  },

  {
    key: "inventory.manage",
    module: "Inventory",
    description: "Manage stock and inventory movements",
  },

  {
    key: "asset.create",
    module: "Assets",
    description: "Register hardware assets",
  },

  {
    key: "asset.assign",
    module: "Assets",
    description: "Assign hardware assets",
  },

  {
    key: "asset.return",
    module: "Assets",
    description: "Process asset returns",
  },

  {
    key: "procurement.manage",
    module: "Procurement",
    description: "Manage procurement activities",
  },

  {
    key: "finance.invoice.verify",
    module: "Finance",
    description: "Verify vendor invoices",
  },

  {
    key: "finance.payment.manage",
    module: "Finance",
    description: "Record and manage payments",
  },

  {
    key: "maintenance.manage",
    module: "Maintenance",
    description: "Manage maintenance tickets",
  },

  {
    key: "reports.view",
    module: "Reports",
    description: "View authorized reports",
  },

  {
    key: "admin.roles.manage",
    module: "Administration",
    description: "Manage role assignments",
  },

  {
    key: "admin.workflow.manage",
    module: "Administration",
    description: "Configure approval workflows",
  },

  {
    key: "audit.view",
    module: "Administration",
    description: "View audit history",
  },
] as const;

export type PermissionKey =
  (typeof permissions)[number]["key"];
```

Add permissions as new features are introduced. Avoid scattering hard-coded permission strings across unrelated files.

## 5.3 Database permission tables

Use these tables, or integrate their equivalent with the existing application's RBAC structure.

### `permissions`

| Column | Purpose |
|---|---|
| id | Primary key |
| permission_key | Unique key such as `approve.button` |
| module | Permission module |
| description | Permission description |
| created_at | Creation timestamp |
| updated_at | Last update timestamp |

### `roles`

| Column | Purpose |
|---|---|
| id | Primary key |
| role_name | Role name |
| description | Description |
| is_active | Active status |
| created_at | Creation timestamp |

### `user_roles`

| Column | Purpose |
|---|---|
| id | Primary key |
| user_id | FK to existing `users` table |
| role_id | FK to roles |
| assigned_by_user_id | FK to existing `users` table |
| assigned_at | Assignment timestamp |

### `role_permissions`

| Column | Purpose |
|---|---|
| id | Primary key |
| role_id | FK to roles |
| permission_id | FK to permissions |
| created_at | Creation timestamp |

Recommended constraints:

- Unique `permissions.permission_key`.
- Unique `roles.role_name`, subject to organization policy.
- Unique combination of `user_roles.user_id` and `user_roles.role_id`.
- Unique combination of `role_permissions.role_id` and `role_permissions.permission_id`.
- Foreign keys with appropriate delete restrictions.
- User foreign keys matching the existing `users` primary-key type.

If the current system already has these tables, map the design to them rather than duplicating them.

## 5.4 Permission seeding

Use:

```bash
npm run seed
```

The seed script must:

1. Read `config/permissions.config.ts`.
2. Check whether each permission key exists.
3. Insert missing permission keys.
4. Update descriptions and module names when changed.
5. Preserve existing permission IDs wherever possible.
6. Never delete role assignments automatically.
7. Never grant all permissions to existing roles.
8. Run safely more than once.

Example `prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { permissions } from "../config/permissions.config";

const prisma = new PrismaClient();

async function main() {
  for (const permission of permissions) {
    await prisma.permissions.upsert({
      where: {
        permission_key: permission.key,
      },
      update: {
        module: permission.module,
        description: permission.description,
      },
      create: {
        permission_key: permission.key,
        module: permission.module,
        description: permission.description,
      },
    });
  }

  console.log("Permission catalogue synchronized.");
}

main()
  .catch((error) => {
    console.error("Permission seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

The Prisma model and field names must match the actual schema. If the project uses a different naming convention, adjust the code accordingly.

**Important:** Seeding the permission catalogue and assigning permissions to roles are separate operations. Role permission assignments should be explicitly configured by an authorized administrator or a separately reviewed initial setup process.

## 5.5 Permission checks in frontend

Create a shared permission utility.

```ts
// lib/permissions.ts

import type { PermissionKey } from "../config/permissions.config";

export function hasPermission(
  user: { permissions: string[] },
  permission: PermissionKey
): boolean {
  return user.permissions.includes(permission);
}
```

Example:

```tsx
import { hasPermission } from "@/lib/permissions";

{hasPermission(user, "approve.button") && (
  <Button onClick={handleApprove}>
    Approve
  </Button>
)}
```

This controls visibility and usability. It is not a security boundary.

## 5.6 Backend permission checks

Every protected API must independently verify authorization.

Example:

```ts
// server/middleware/authorize.ts

import type { NextApiRequest, NextApiResponse } from "next";

export function requirePermission(
  req: NextApiRequest,
  res: NextApiResponse,
  permission: string
) {
  const user = req.user;

  if (!user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "UNAUTHENTICATED",
    });

    return false;
  }

  if (!user.permissions.includes(permission)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission",
      code: "FORBIDDEN",
    });

    return false;
  }

  return true;
}
```

The example assumes authentication middleware has securely attached a verified user and effective permissions to the request. Implement the actual request typing and authentication integration for the existing project.

Example API usage:

```ts
if (!requirePermission(req, res, "approve.button")) {
  return;
}
```

Also enforce record-level scope. A manager who has approval permission must still only approve requests within their configured organizational scope and assigned workflow tasks.

**Security rule:** Frontend permission checks improve the user experience. Backend permission and record-level checks protect the data.

---

# 6. Configuration-Driven Sidebar Navigation

Sidebar navigation must be controlled through:

`config/sidebar.config.ts`

Each navigation entry should contain:

- Label
- Route
- Icon
- Required permission
- Optional child navigation

Example:

```ts
// config/sidebar.config.ts

export const sidebarConfig = [
  {
    label: "Dashboard",
    route: "/dashboard",
    icon: "LayoutDashboard",
    permission: "dashboard.view",
  },

  {
    label: "Hardware Requests",
    route: "/requests",
    icon: "ClipboardList",
    permission: "request.view",
  },

  {
    label: "Approvals",
    route: "/approvals",
    icon: "CheckCircle",
    permission: "request.approve",
  },

  {
    label: "Inventory",
    route: "/inventory",
    icon: "Warehouse",
    permission: "inventory.view",
  },

  {
    label: "Assets",
    route: "/assets",
    icon: "Laptop",
    permission: "asset.create",
  },

  {
    label: "Procurement",
    route: "/procurement/vendors",
    icon: "ShoppingCart",
    permission: "procurement.manage",
  },

  {
    label: "Finance",
    route: "/finance/invoices",
    icon: "Wallet",
    permission: "finance.invoice.verify",
  },

  {
    label: "Maintenance",
    route: "/maintenance",
    icon: "Wrench",
    permission: "maintenance.manage",
  },

  {
    label: "Reports",
    route: "/reports",
    icon: "ChartBar",
    permission: "reports.view",
  },

  {
    label: "Administration",
    route: "/admin/roles",
    icon: "Settings",
    permission: "admin.roles.manage",
  },
];
```

The actual icon component should map configured icon names to an approved icon library. Do not dynamically execute arbitrary icon names.

## 6.1 Shared Sidebar component

The shared Sidebar component should:

1. Read `sidebarConfig`.
2. Receive the authenticated user's effective permissions.
3. Filter navigation entries by required permission.
4. Display only authorized links.
5. Support active route highlighting.
6. Support nested navigation if needed.
7. Support responsive mobile navigation.

Example:

```tsx
const visibleItems = sidebarConfig.filter((item) =>
  hasPermission(user, item.permission)
);
```

A navigation entry being hidden does not secure the page. Direct URL access and all API requests must still be protected by server-side authorization.

---

# 7. User Roles and Business Responsibilities

| Role | Responsibilities |
|---|---|
| Employee | Create own requests, view own requests and assets, acknowledge issue, report hardware problems |
| Reporting Manager | Approve requests from authorized direct reports or teams |
| Department Head | Approve requests within department and budget scope |
| HR | Verify employee status and manage onboarding/exit coordination |
| IT Admin / Asset Manager | Review specifications, manage inventory, register assets, issue and return hardware |
| IT Technician | Diagnose and resolve maintenance tickets |
| Procurement Officer | Manage vendors, quotations and purchase orders |
| Finance Officer | Manage budgets, invoice verification and payment records |
| Inventory Manager | Receive goods, maintain stock and record movements |
| Auditor | View permitted records and audit history |
| Super Admin | Manage application configuration, roles, permissions and workflows |

A user may have multiple roles. Effective permissions are calculated from the user's assigned roles and applicable organizational scope.

---

# 8. Functional Modules

## 8.1 Employee module

Features:

- Employee dashboard
- Create hardware request
- Add multiple request items
- Select hardware category
- Enter hardware specifications
- Upload supporting documents
- View request status
- View approval timeline
- View assigned assets
- Acknowledge asset handover
- Raise hardware issue
- Request asset return or transfer where policy permits

Employee information must be read from the existing `users` table and related existing organizational tables.

## 8.2 Hardware request module

A request contains a header and one or more items.

### Request header fields

- Request number
- Requester user ID
- Request type
- Purpose
- Justification
- Priority
- Required date
- Department or cost centre reference, where available
- Current status
- Submitted date

### Request item fields

- Hardware category
- Quantity
- Requested specification
- Approved specification
- Estimated unit price
- Fulfilled quantity
- Fulfilment status
- IT review comments

A single request can contain multiple items and may be partially fulfilled from existing stock and partially through procurement.

## 8.3 Approval workflow module

Features:

- Configurable workflow templates
- Request-type conditions
- Amount-based conditions
- Department-based conditions
- Sequential approval
- Parallel approval where required
- Approver resolution from organizational relationships or configured roles
- Approval, rejection and return-for-changes actions
- Delegation
- Escalation
- Approval history
- Workflow versioning

Approval stages must be generated from the workflow configuration. Do not hard-code an approver sequence into the request API.

Each approval action must record:

- Request and workflow stage
- Approver user ID
- Action
- Comments
- Timestamp
- Workflow version

## 8.4 IT review module

Features:

- View approved requests awaiting IT review
- Review requested specifications
- Recommend equivalent hardware
- Check compatible inventory
- Reserve available stock
- Split fulfilment between stock and procurement
- Estimate procurement cost
- Record technical notes
- Mark an item as requiring procurement

## 8.5 Inventory module

Features:

- Hardware categories
- Stock by location
- Stock by category
- Available, reserved, issued, damaged and under-repair quantities
- Stock reservations
- Goods receipt
- Stock transfer
- Stock adjustment with reason
- Stock movement history

Do not treat every quantity-tracked item as an individually serialized asset. Use category-level stock for consumables and serialized asset records for individually identifiable equipment.

## 8.6 Asset management module

Features:

- Asset registration
- Asset tag generation
- Serial number
- Manufacturer and model
- Purchase information
- Warranty
- Location
- Asset condition
- Asset status
- Assignment history
- Employee acknowledgement
- Asset transfer
- Asset return
- Inspection
- Repair
- Retirement/disposal

An asset must have a complete lifecycle history.

## 8.7 Procurement module

Features:

- Vendor master
- Vendor contacts
- Quotation requests
- Multiple quotation records
- Quotation comparison
- Vendor selection
- Purchase requisition
- Purchase order creation
- Purchase order approval
- Goods receipt
- Purchase order status tracking

Procurement records must reference the approved request items where applicable.

## 8.8 Finance module

Features:

- Budget allocation
- Department/cost-centre budget tracking
- Estimated purchase value
- Purchase order value
- Invoice entry
- Invoice attachment
- Invoice verification
- Tax and subtotal details
- Discrepancy handling
- Payment approval
- Payment recording
- Payment reference

Invoice verification and payment approval should be separate permissions where separation of duties is required.

## 8.9 Maintenance module

Features:

- Employee issue reporting
- Asset-linked maintenance ticket
- Priority and severity
- Technician assignment
- Diagnosis
- Repair activity
- Spare parts and repair cost
- Resolution notes
- SLA tracking
- Ticket closure
- Repeat issue tracking

## 8.10 Notification module

Notification events include:

- Request submitted
- Approval pending
- Request approved or rejected
- Request returned for changes
- Stock reserved
- Procurement initiated
- Purchase order approved
- Goods received
- Asset assigned
- Asset acknowledgement pending
- Maintenance ticket assigned
- Maintenance ticket resolved
- Asset return pending

Support in-app notifications and internal email where configured.

## 8.11 Reports and dashboards

Reports:

- Hardware requests by status
- Pending approvals
- Approval turnaround time
- Department-wise expenditure
- Category-wise expenditure
- Inventory availability
- Stock ageing
- Asset assignment report
- Asset return report
- Warranty expiry
- Maintenance history
- Vendor procurement summary
- Invoice and payment summary
- Audit activity

All reports must apply user scope and permission checks.

## 8.12 Administration module

Features:

- Role management
- User-to-role assignment using existing users
- Role-to-permission assignment
- Workflow configuration
- Hardware category management
- Specification templates
- Location and warehouse configuration
- Cost centre configuration
- Numbering configuration
- Status and policy configuration
- Audit viewer

---

# 9. Database Design — Microsoft SQL Server

Use SQL Server-compatible schema and data types.

Typical mappings:

| Application concept | SQL Server type |
|---|---|
| Integer identity | `INT IDENTITY(1,1)` |
| Large integer | `BIGINT IDENTITY(1,1)` |
| Existing user key | Exact existing `users` PK type |
| Text | `NVARCHAR(n)` |
| Long text | `NVARCHAR(MAX)` |
| Date/time | `DATETIME2` |
| Boolean | `BIT` |
| Currency/amount | `DECIMAL(18,2)` |
| Percentage | `DECIMAL(9,4)` |
| Unique identifier | `UNIQUEIDENTIFIER` |

Use `DECIMAL` for financial values. Do not use floating-point types for currency.

Avoid MySQL-specific syntax such as `AUTO_INCREMENT`, `UNSIGNED`, MySQL `ENUM`, and MySQL-specific migration DDL.

## 9.1 Main domain tables

The following is the logical table catalogue. Exact column types and names must be finalized after inspecting the existing SQL Server schema.

### Identity and authorization

- Existing `users` — reuse; do not recreate.
- `permissions`
- `roles`
- `user_roles`
- `role_permissions`

### Hardware masters

- `hardware_categories`
- `hardware_specification_templates`
- `hardware_specification_fields`
- `locations`
- `warehouses`
- `cost_centres`

Reuse existing department, location and organizational master tables wherever they already exist.

### Requests and approvals

- `hardware_requests`
- `hardware_request_items`
- `request_attachments`
- `approval_workflows`
- `approval_workflow_stages`
- `approval_tasks`
- `approval_history`

### Inventory and assets

- `inventory_stock`
- `inventory_reservations`
- `inventory_movements`
- `assets`
- `asset_assignments`
- `asset_assignment_history`
- `asset_returns`
- `asset_transfers`

### Procurement

- `vendors`
- `vendor_contacts`
- `purchase_requisitions`
- `quotations`
- `quotation_items`
- `purchase_orders`
- `purchase_order_items`
- `goods_receipts`
- `goods_receipt_items`

### Finance

- `budgets`
- `budget_allocations`
- `invoices`
- `invoice_items`
- `payments`

### Maintenance and support

- `maintenance_tickets`
- `maintenance_activities`
- `maintenance_parts`

### Shared application records

- `notifications`
- `audit_logs`
- `document_attachments`
- `system_settings`

## 9.2 Important relationships

```text
users
  |
  +---- hardware_requests
  |          |
  |          +---- hardware_request_items
  |          |
  |          +---- approval_tasks
  |          |
  |          +---- approval_history
  |
  +---- asset_assignments
  |          |
  |          +---- assets
  |
  +---- maintenance_tickets
  |
  +---- notifications
  |
  +---- user_roles
             |
             +---- roles
                       |
                       +---- role_permissions
                                  |
                                  +---- permissions
```

Procurement relationships:

```text
hardware_requests
        |
        v
purchase_requisitions
        |
        v
quotations
        |
        v
purchase_orders
        |
        v
goods_receipts
        |
        v
assets / inventory_stock
        |
        v
invoices
        |
        v
payments
```

The exact relationships should allow one request item to have more than one fulfilment source.

## 9.3 Important schema requirements

### Hardware requests

- Unique request number.
- Requester FK to existing `users`.
- Request status.
- Submission timestamp.
- Request items linked to request header.
- No duplicated employee master data.

### Approval tasks

- Request FK.
- Workflow stage FK.
- Approver FK to existing `users`.
- Action status.
- Due date.
- Action timestamp.
- Comments.
- Support for delegation if configured.

### Assets

- Unique asset tag.
- Serial number where applicable.
- Hardware category.
- Manufacturer/model.
- Purchase date and cost.
- Warranty end date.
- Current status.
- Current location.
- Historical assignments retained separately.

### Inventory

- Stock tracked by category and warehouse.
- Reserved quantities tracked separately from available quantities.
- Stock movement records retained.
- Prevent reservations from exceeding available stock.

### Finance

- Financial values stored as `DECIMAL`.
- Invoice and purchase order references retained.
- Payment records separate from invoice records.
- Invoice discrepancy and approval history preserved.

## 9.4 Database indexing

Add indexes based on real query patterns.

Initial candidates:

- `hardware_requests.requester_user_id`
- `hardware_requests.status`
- `hardware_requests.created_at`
- `hardware_request_items.hardware_request_id`
- `approval_tasks.approver_user_id`
- `approval_tasks.status`
- `assets.asset_tag`
- `assets.serial_number`
- `assets.status`
- `asset_assignments.user_id`
- `inventory_stock.warehouse_id`
- `purchase_orders.status`
- `invoices.status`
- `maintenance_tickets.assigned_to_user_id`
- `notifications.recipient_user_id`

Use unique constraints for business identifiers and appropriate composite indexes for frequently used filters.

---

# 10. Prisma and SQL Server Configuration

Use Prisma as the proposed ORM and migration tool, with a pinned version that supports the selected SQL Server environment.

Validate the exact Prisma version, SQL Server provider capabilities, relation behavior and migration support before implementation. Do not assume every Prisma feature behaves identically across database providers.

Example `prisma/schema.prisma` starting point:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlserver"
  url      = env("DATABASE_URL")
}
```

Add domain models after inspecting the existing database. If the application uses an existing `users` table, map to it using the actual table and column names.

For example, a user model mapping must reflect the real database structure rather than inventing a new employee model.

Example `.env.example`:

```env
DATABASE_URL="sqlserver://DB_HOST:1433;database=HMS;user=HMS_USER;password=CHANGE_ME;encrypt=true;trustServerCertificate=false"

NODE_ENV=development
```

Use the connection-string format required by the pinned Prisma SQL Server connector and the organization's SQL Server configuration. Do not commit real credentials.

For local development with a trusted internal certificate, certificate settings may differ. Production should use the organization's approved TLS configuration.

---

# 11. Database Migration and Seed Commands

The project must include database migration scripts.

Required commands:

```bash
npm run migrate
npm run seed
```

Recommended `package.json` scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",

    "migrate": "prisma migrate deploy",
    "migrate:dev": "prisma migrate dev",
    "seed": "tsx prisma/seed.ts",

    "prisma:generate": "prisma generate",
    "prisma:status": "prisma migrate status"
  }
}
```

Confirm the selected Prisma version supports the scripts and configuration exactly as pinned. Configure the seed command according to that version's documented Prisma seed setup.

## 11.1 Development migration

When a schema change is made during development:

```bash
npx prisma migrate dev --name add_hardware_requests
```

Or use the package script:

```bash
npm run migrate:dev -- --name add_hardware_requests
```

The exact argument forwarding should be tested in the project's package manager and shell.

## 11.2 Production migration

Deploy approved migrations using:

```bash
npm run migrate
```

This runs the deployment migration command and applies migrations that have already been created and committed.

Do not use development migration commands as the production deployment process.

## 11.3 Seed

Run:

```bash
npm run seed
```

This synchronizes the permission catalogue from `config/permissions.config.ts`.

If initial roles are also seeded, keep that process separate and explicit. Do not silently grant all permissions to all roles.

## 11.4 Migration safety checklist

Before applying migrations:

1. Inspect the existing SQL Server database.
2. Inspect the existing `users` table.
3. Confirm user primary-key types.
4. Check existing role and permission tables.
5. Reuse existing organizational master tables.
6. Generate migrations in dependency order.
7. Review generated SQL Server DDL.
8. Test migrations against a database copy.
9. Verify existing user records and login behavior remain unchanged.
10. Test rollback or documented recovery procedures.
11. Take an approved backup before production changes.

---

# 12. API Blueprint

Base API path:

`/api/v1`

Use Next.js API route handlers under `pages/api/`.

All endpoints require authentication unless explicitly public.

The server derives the current actor from the authenticated session. Never trust a client-supplied requester or approver ID.

## 12.1 Standard response

Success:

```json
{
  "success": true,
  "message": "Request retrieved successfully",
  "data": {},
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

Error:

```json
{
  "success": false,
  "message": "You are not authorized to perform this action",
  "code": "FORBIDDEN",
  "errors": []
}
```

## 12.2 Current user

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/me` | Current signed-in user and effective permissions |
| GET | `/users` | Search existing users within authorized scope |
| GET | `/users/:id` | Read permitted user information |
| GET | `/users/:id/assets` | View authorized user's assigned assets |
| GET | `/users/:id/requests` | View authorized user's requests |

All user lookup operations must use the existing `users` table.

## 12.3 Dashboard

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/dashboard/employee` | Employee dashboard |
| GET | `/dashboard/manager` | Manager dashboard |
| GET | `/dashboard/it` | IT dashboard |
| GET | `/dashboard/procurement` | Procurement dashboard |
| GET | `/dashboard/finance` | Finance dashboard |
| GET | `/dashboard/hr` | HR dashboard |
| GET | `/dashboard/management` | Management dashboard |

## 12.4 Hardware requests

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/hardware-requests` | List authorized requests |
| POST | `/hardware-requests` | Create request |
| GET | `/hardware-requests/:id` | Request details |
| PUT | `/hardware-requests/:id` | Update permitted draft |
| POST | `/hardware-requests/:id/submit` | Submit request |
| POST | `/hardware-requests/:id/cancel` | Cancel request where allowed |
| GET | `/hardware-requests/:id/history` | Request history |

## 12.5 Approvals

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/approvals` | Current user's approval tasks |
| GET | `/approvals/:id` | Approval details |
| POST | `/approvals/:id/approve` | Approve |
| POST | `/approvals/:id/reject` | Reject |
| POST | `/approvals/:id/return` | Return for changes |
| POST | `/approvals/:id/reassign` | Reassign if authorized |

## 12.6 IT review and inventory

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/inventory` | Inventory list |
| GET | `/inventory/availability` | Availability check |
| POST | `/inventory/reservations` | Reserve stock |
| POST | `/inventory/reservations/:id/release` | Release reservation |
| POST | `/inventory/movements` | Record stock movement |
| POST | `/hardware-requests/:id/it-review` | Save IT review |
| POST | `/hardware-requests/:id/fulfilment` | Define stock/procurement fulfilment |

## 12.7 Assets and assignments

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/assets` | List assets |
| POST | `/assets` | Register asset |
| GET | `/assets/:id` | Asset details |
| PUT | `/assets/:id` | Update permitted asset fields |
| POST | `/assets/:id/assign` | Assign asset |
| POST | `/assets/:id/return` | Process return |
| POST | `/assets/:id/transfer` | Transfer asset |
| GET | `/assets/:id/history` | Asset lifecycle history |

## 12.8 Procurement

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST | `/vendors` | Vendor list and creation |
| GET/POST | `/quotations` | Quotation management |
| GET/POST | `/purchase-requisitions` | Purchase requisitions |
| GET/POST | `/purchase-orders` | Purchase orders |
| GET | `/purchase-orders/:id` | PO details |
| POST | `/purchase-orders/:id/approve` | Approve PO |
| POST | `/goods-receipts` | Receive goods |

## 12.9 Finance

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST | `/budgets` | Budget management |
| GET/POST | `/invoices` | Invoice management |
| GET | `/invoices/:id` | Invoice details |
| POST | `/invoices/:id/verify` | Verify invoice |
| POST | `/invoices/:id/approve` | Approve invoice |
| GET/POST | `/payments` | Payment records |

## 12.10 Maintenance

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST | `/maintenance-tickets` | List/create tickets |
| GET | `/maintenance-tickets/:id` | Ticket details |
| POST | `/maintenance-tickets/:id/assign` | Assign technician |
| POST | `/maintenance-tickets/:id/activity` | Record work |
| POST | `/maintenance-tickets/:id/resolve` | Resolve ticket |
| POST | `/maintenance-tickets/:id/close` | Close ticket |

## 12.11 Administration and reports

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/admin/roles` | List roles |
| POST | `/admin/roles` | Create role |
| PUT | `/admin/roles/:id` | Update role |
| GET | `/admin/permissions` | Permission catalogue |
| PUT | `/admin/roles/:id/permissions` | Configure role permissions |
| POST | `/admin/users/:id/roles` | Assign role to existing user |
| GET/POST | `/admin/workflows` | Workflow configuration |
| GET | `/admin/audit-logs` | Audit records |
| GET | `/reports/...` | Authorized reports |

## 12.12 API security rules

- Authenticate every protected endpoint.
- Check permission on the server.
- Check record-level access.
- Validate request bodies and query parameters.
- Derive requester identity from the authenticated session.
- Use transactions for multi-record operations.
- Use idempotency protection for retriable actions.
- Paginate list endpoints.
- Allowlist sort fields.
- Do not expose password hashes or secrets.
- Document endpoints with OpenAPI.
- Return consistent error formats.

---

# 13. Screen and Page Blueprint

## 13.1 Employee screens

| Screen | Page | Purpose |
|---|---|---|
| Employee Dashboard | `/dashboard/employee` | Requests, assigned assets, tickets |
| Request List | `/requests` | Employee's request history |
| Create Request | `/requests/create` | Submit a hardware request |
| Request Details | `/requests/[id]` | View request and approval timeline |
| My Assets | `/assets` or dedicated employee route | View assigned assets |
| Report Issue | `/maintenance` | Report hardware problem |

## 13.2 Approval screens

| Screen | Page | Purpose |
|---|---|---|
| Approval Inbox | `/approvals` | Pending approval tasks |
| Approval Detail | `/approvals/[id]` | Review and take action |

Approval details should show:

- Request number
- Requester
- Department
- Request date
- Requested items
- Specifications
- Business justification
- Previous approval history
- Current stage
- Approve/reject/return actions

## 13.3 IT screens

| Screen | Page | Purpose |
|---|---|---|
| IT Dashboard | `/dashboard/it` | Review and stock summary |
| IT Review | Request details or dedicated IT page | Technical assessment |
| Inventory | `/inventory` | Stock overview |
| Reservations | `/inventory/reservations` | Stock reservation management |
| Asset Register | `/assets` | Asset lifecycle management |
| Asset Issue | Asset detail or assignment workflow | Assign hardware |

## 13.4 Procurement screens

| Screen | Page | Purpose |
|---|---|---|
| Vendor List | `/procurement/vendors` | Vendor master |
| Quotations | `/procurement/quotations` | Quotation comparison |
| Purchase Orders | `/procurement/purchase-orders` | PO management |
| Goods Receipt | `/procurement/goods-receipts` | Goods receipt |

## 13.5 Finance screens

| Screen | Page | Purpose |
|---|---|---|
| Budget | `/finance/budgets` | Budget tracking |
| Invoice List | `/finance/invoices` | Invoice management |
| Invoice Details | Invoice detail route | Verification |
| Payments | `/finance/payments` | Payment records |

## 13.6 Administration screens

| Screen | Page | Purpose |
|---|---|---|
| Role Management | `/admin/roles` | Role configuration |
| User Role Assignment | `/admin/users` | Assign roles to existing users |
| Workflow Builder | `/admin/workflows` | Approval configuration |
| Master Data | `/admin/master-data` | Categories and locations |
| Audit Logs | `/admin/audit-logs` | Audit viewer |

## 13.7 Shared UI components

Build reusable components for:

- Button
- Input
- Select
- Textarea
- Checkbox
- Radio group
- Date picker
- Modal
- Confirmation dialog
- Data table
- Pagination
- Search and filters
- Status badge
- File upload
- Breadcrumb
- Page header
- Sidebar
- Header
- Dashboard card
- Approval timeline
- Empty state
- Loading state
- Error state

All components should use Tailwind CSS and shared design tokens.

Avoid creating a separate implementation of the same table, form field or modal for every module.

---

# 14. Core Business Workflows

## 14.1 Hardware request workflow

```text
Employee creates request
        |
        v
Request submitted
        |
        v
Configured approval workflow
        |
        v
Approvals completed
        |
        v
IT technical review
        |
        v
Inventory availability check
        |
   +----+----+
   |         |
Stock      No stock
available  available
   |         |
   v         v
Reserve    Procurement
stock      process
   |         |
   |      Goods receipt
   |         |
   +----+----+
        |
        v
Asset registration / allocation
        |
        v
Asset assignment
        |
        v
Employee acknowledgement
        |
        v
Request fulfilled
```

## 14.2 Approval workflow

Approval configuration should support:

- Request type
- Amount conditions
- Department conditions
- Sequential stages
- Parallel stages
- Role-based approver resolution
- Manager-based approver resolution
- Delegation
- Escalation
- Rejection
- Return for changes
- Workflow versioning

When a request is submitted, save the workflow version used for that request. Later workflow edits must not silently rewrite existing approval history.

## 14.3 Stock reservation

Before reserving stock:

1. Check item compatibility.
2. Check warehouse and location.
3. Check available quantity.
4. Confirm no conflicting reservation.
5. Reserve within a database transaction.
6. Record the stock movement or reservation event.

Do not allow two concurrent requests to reserve the same available unit.

Define reservation expiry and release policies.

## 14.4 Partial fulfilment

Example:

An employee requests:

- 1 laptop
- 2 monitors
- 1 keyboard

If the laptop and one monitor are available but the second monitor and keyboard are not, the system should support:

- Stock reservation for available items.
- Procurement for unavailable items.
- Separate item fulfilment statuses.
- Request status of partially fulfilled until all required items are resolved.

## 14.5 Asset assignment

Before assignment:

- Request item must be approved.
- Asset must be available or reserved for that request.
- Employee must be active and eligible.
- Asset must not already be assigned.
- Authorized actor must have assignment permission.

Record:

- Employee user ID
- Asset ID
- Assignment date
- Condition
- Accessories
- Handover document
- Acknowledgement timestamp
- Issuing user ID

## 14.6 Asset return

When an asset is returned:

1. Identify the active assignment.
2. Record return date.
3. Record physical condition.
4. Record accessories.
5. Record inspection notes.
6. Set the asset's next status.
7. Close the assignment without deleting history.

Possible next statuses:

- Available
- Under maintenance
- Damaged
- Retired

## 14.7 End-to-end walkthrough: employee request → handover → payment

This section describes the **implemented** flow step by step: who acts, when they act, where they click, what the system does, and why the step exists. Use it for onboarding, UAT scripts and support.

The flow has five implemented phases, plus one entry route that is planned but **not yet developed**:

| Phase | Owner | Starts when | Ends when |
|---|---|---|---|
| **A0. New-joinee onboarding** ⏳ *PENDING — to be developed* | HR | A new employee joins | HR's request for the joinee is submitted to the **joinee's manager**; from there it continues as phase A (step 3) |
| **A. Request & approval** | Employee, approvers | Employee needs an asset | Request is **Approved** |
| **B. IT review & stock** | IT Admin | Request is Approved | Every unit is reserved from stock or marked for purchase |
| **C. Procurement** | Procurement Officer, Finance Manager, IT Admin | IT marks a quantity to procure | Goods are received and auto-reserved for the request |
| **D. Finance** | Finance Officer, Finance Manager | Vendor sends an invoice for a placed purchase order | Invoice is **Paid** |
| **E. Handover** | IT Admin, Employee | A unit is reserved for the request | Request is **Fulfilled** |

Phase D runs **in parallel** with phase E. Handing the asset to the employee never waits for the vendor to be paid.

### 14.7.1 Actors at a glance

| Actor (role key) | Key permissions | Responsibility in this flow |
|---|---|---|
| Employee (`EMPLOYEE`) | `request.create`, `request.view`, `asset.view` | Raises the request, fixes it if returned, confirms receipt |
| Reporting Manager (`REPORTING_MANAGER`) | `request.approve`, `approve.button` | First approval: confirms the business need |
| Role approver, e.g. IT head (`IT_ADMIN`) | `request.approve` | Further workflow stages (e.g. high-value requests) |
| IT Admin (`IT_ADMIN`) | `request.it_review`, `inventory.manage`, `asset.assign`, `procurement.receive` | Technical review, stock reservation, goods receipt, handover |
| Procurement Officer (`PROCUREMENT_OFFICER`) | `procurement.manage`, `procurement.receive` | Vendors, requisitions, quotations, vendor selection, purchase orders, goods receipt |
| Finance Officer (`FINANCE_OFFICER`) | `finance.budget.manage`, `finance.invoice.verify`, `finance.payment.manage` | Budgets, invoice entry, three-way-match verification, payment recording |
| Finance Manager (`FINANCE_MANAGER`) | `finance.budget.manage`, `procurement.po.approve`, `finance.invoice.approve` | Approves purchase orders and verified invoices |
| Super Admin / Administrator | `admin.workflow.manage`, `admin.roles.manage` | Configures workflows, roles and manager links |
| HR ⏳ *PENDING* (`HR` role not yet created) | *to be defined*, e.g. `request.create.on_behalf` | Raises the onboarding asset request for a new joinee (§14.7.13) |

**Separation-of-duties rules enforced by the server:**
- the person who created a purchase order cannot approve it;
- the person who verified an invoice cannot approve it;
- only an invoice approver can reject an invoice that is already verified.

### 14.7.2 Flow overview

```text
 HR  ⏳ PENDING — TO BE DEVELOPED (§14.7.13)
 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
 ┆ N1 New joinee created / joins                                      ┆
 ┆ N2 HR raises onboarding request FOR the joinee (laptop / tablet)   ┆
 ┆ N3 Submit → routed to the JOINEE's reporting manager ┄┄┄┄┐         ┆
 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
                                                            ┆ joins the normal flow at ③
 EMPLOYEE        APPROVERS        IT ADMIN                PROCUREMENT              FINANCE
 ────────        ─────────        ────────                ───────────              ───────
 ① Create                  ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
   (Draft)                 ▼
 ② Submit ─────▶ ③ Approve
   (Pending       │ reject ─▶ Rejected (end)
    Approval)     │ return ─▶ Returned ─▶ back to ①
                  ▼
               Approved ──────▶ ④ IT review
                                (Under IT Review)
                                   │
                      ┌────────────┴─────────────┐
                      │ in stock                 │ short / no stock
                      ▼                          ▼
                 ⑤ Reserve                  ⑥ Mark qty to procure
                      │                     (Awaiting Procurement) ──▶ P1 Requisition
                      │                                                P2 Quotations + select
                      │                                                P3 Purchase order ─────▶ P4 Approve PO
                      │                                                P5 Send to vendor ◀────── (Finance Mgr)
                      │                 P6 Goods receipt ◀─────────────────┘
                      │                 (assets registered,                          F1 Enter invoice
                      │                  auto-reserved)                               F2 Verify (3-way match)
                      ▼                          │                                    F3 Approve invoice
                 ⑦ Issue / hand over ◀──────────┘                                    F4 Record payment
                      │ (Partially Fulfilled)                                         (Paid)
                      ▼
 ⑧ "I received this" ◀┘
   (Fulfilled)

 Legend:  ───  implemented      ┄┄┄ / ⏳  pending, to be developed
          For an onboarding request, "EMPLOYEE" in steps ⑦–⑧ is the new joinee.
```

### 14.7.3 Status maps

**Asset request**

| Status | Reached when | Next possible statuses |
|---|---|---|
| Draft | Employee saves without submitting | Pending Approval, Cancelled |
| Pending Approval | Employee submits; first stage tasks are created | Approved, Rejected, Returned for Changes, Cancelled |
| Returned for Changes | An approver returns it with a comment | Pending Approval (resubmit), Cancelled |
| Rejected | An approver rejects it with a comment | — (final) |
| Approved | Last approval stage is complete (or the workflow has no stages) | Under IT Review, Cancelled |
| Under IT Review | IT saves the first review | Awaiting Procurement, Partially Fulfilled, Fulfilled, Cancelled |
| Awaiting Procurement | Some quantity is marked for purchase and not yet covered | Partially Fulfilled, Fulfilled |
| Partially Fulfilled | At least one unit delivered, but not all | Awaiting Procurement, Fulfilled |
| Fulfilled | Every unit delivered **and** every serialized handover acknowledged | — (final) |
| Cancelled | Requester cancels (Draft / Pending Approval / Returned / Approved only) | — (final) |

**Purchase requisition:** Open → Quotation Stage → Ordered → Closed (or Cancelled while Open / Quotation Stage).

**Purchase order:** Draft → Pending Approval → Approved → Sent to Vendor → Partially Received → Fully Received → Closed. A rejected PO goes back from Pending Approval to Draft. A PO can be Cancelled before any goods are received.

**Invoice:** Received → Verified (or Discrepancy → Verified once accepted) → Approved → Partially Paid → Paid. It can be Rejected from Received, Discrepancy or Verified.

Statuses are changed only by the service layer (`shared/config/status.config.ts`). After IT review, the request status is **derived automatically** from item quantities (`modules/requests/requests.rules.ts`). Nobody sets it by hand.

### 14.7.4 Step 0 — One-time and periodic setup

| Who | When | Where | Do | Why |
|---|---|---|---|---|
| Super Admin / Administrator | Go-live; whenever people join or change teams | Administration → **Users & Access** (`/admin/users`), **Roles** (`/admin/roles`) | Give every user a role and set each employee's **reporting manager** | Approvers come from the manager link and from role holders |
| Super Admin / Administrator | Go-live; when policy changes | Administration → **Workflows** (`/admin/workflows`) | Define at least one active approval workflow, with optional amount, department or request-type conditions | Requests cannot be submitted without a matching workflow |
| Super Admin / Administrator | Go-live; when new models are bought | Administration → **Master Data** (`/admin/master-data`), **Item Master** (`/masters/items`) | Set up asset categories, warehouses and orderable items | Requests can only use items from the item master |
| Procurement Officer | Before the first purchase; when a new supplier is onboarded | Procurement → **Vendors** (`/procurement/vendors`) | Add vendors with code, GSTIN, contacts and **payment terms (days)** | Quotations and POs need an active vendor; payment terms set the invoice due date |
| Finance Officer / Finance Manager | Start of each fiscal year (April, e.g. "2026-27") | Finance → **Budgets** (`/finance/budgets`) | Create one budget per department (and cost centre) | Lets Finance track committed spend (approved POs) and paid spend against the allocation |

Defaults shipped by the dev seed:
- *Standard asset approval*: one stage, Reporting manager.
- *High-value asset approval* (estimated value ≥ 200,000): stage 1 Reporting manager, then stage 2 IT head (`IT_ADMIN`).

### 14.7.5 Phase A — Request & approval

#### Step 1 — Create the request (Employee)

- **When:** the employee needs a new, replacement or upgraded asset.
- **Where:** Sidebar → **Asset Requests** (`/requests`) → **New request** (`/requests/create`).
- **Do:** choose a **request type** (New Asset / Replacement / Upgrade), enter a **purpose** (at least 5 characters), an optional **justification**, a **priority**, an optional **required date** and **cost centre**. Then add 1–20 **items**. Each item needs an item from the master, a quantity (1–500), the required specification, and optionally an estimated unit price.
- **Save as draft** or **Submit** right away.
- **System:** generates the request number (`AM-…`), stores the header and items, writes an audit entry. Status: **Draft**.
- **Why:** the purpose and specification tell approvers and IT what is needed and why. The estimated price decides which amount-based workflow applies. Leaving it blank counts as 0, so the standard workflow is used.

#### Step 2 — Submit for approval (Employee)

- **When:** the draft is complete, or after fixing a request that was returned.
- **Where:** the request detail page (`/requests/[id]`) → **Submit**, or **Submit** on the create/edit form.
- **Rules:** only the requester can submit, the request must be Draft or Returned, and it needs at least one item.
- **System:**
  1. Estimates the value: Σ quantity × estimated unit price.
  2. Picks the workflow. Only the latest active version of each workflow is considered. Among those that match the request type, department and amount, the highest priority wins, then the most specific.
  3. Stores the workflow and its version on the request.
  4. Creates approval tasks for the first stage group and notifies the approvers.

  Status: **Pending Approval**. If the workflow has no stages, the request is **auto-approved**.
- **Why:** routing comes from configuration, not code (§8.3). Storing the version means later workflow edits never rewrite this request's history.
- **Approver resolution:**
  - *Manager stage* → the requester's active reporting manager.
  - *Role stage* → every active user holding that role. Any one of them can approve.
  - The requester is never their own approver.
  - **Fallback:** if a stage finds no eligible approver (no manager set, or no other role holder), the tasks go to active **Administrators**. When the requester is the *only* Administrator, they receive the task themselves. This lets a single admin account test the full flow.
  - If even that finds nobody, submission fails with "No eligible approver could be found…".

#### Step 3 — Approve, reject or return (Manager / role approvers)

- **When:** an approval notification arrives. Each task has a due date, 3 days by default.
- **Where:** Sidebar → **Approvals** (`/approvals`) → open the task (`/approvals/[id]`). The task also appears on the dashboard under "Your work".
- **Review:** requester, department, items, specifications, justification, previous approval history and the current stage.
- **Do one of:**
  - **Approve:** a comment is optional.
  - **Return for changes:** a comment is **required**. Status becomes **Returned for Changes**, open tasks are closed, and the employee is notified. The employee edits the request (`/requests/[id]/edit`) and resubmits, which starts a new approval cycle.
  - **Reject:** a comment is **required**. Status becomes **Rejected**, which is final, and the employee is notified.
- **System:**
  - Only the assigned approver can act, and only while the task is Pending.
  - For a role stage, the first approval skips the sibling tasks.
  - Stages that share a stage order run **in parallel**. The next group opens only when every stage in the current group is approved.
  - After the last group, status becomes **Approved** and the employee is notified.
  - Every action is written to approval history and to the audit log.
- **Why:** the manager confirms the business need. Higher stages add budget or technical oversight. A required comment on return or reject tells the employee exactly what to fix.

### 14.7.6 Phase B — IT review & stock

#### Step 4 — IT review & stock check (IT Admin)

- **When:** a request reaches **Approved**, shown on the dashboard tile "Awaiting IT review". Repeat whenever plans change or ordered goods arrive.
- **Where:** Sidebar → **Asset Requests** → **IT queue** scope (`/requests?scope=it-queue`). Open the request → **IT review & stock check** panel.
- **Do, for each item:**
  1. Confirm or adjust the **approved specification**, for example an equivalent model.
  2. Add **IT notes**.
  3. Look at availability by warehouse.
  4. Enter the quantity to **reserve** from each warehouse, and/or the quantity to **procure**.
- **Rules:**
  - reserved + newly procured quantity cannot exceed the units still unplanned;
  - the procurement quantity cannot be reduced here.
- **System:** status moves Approved → **Under IT Review**. The spec, notes, reviewer and time are saved. Reservations are made (step 5). The status is then recomputed: **Awaiting Procurement** if any shortfall is marked for purchase.
- **Why:** IT confirms the asset is technically right and that existing stock is used before buying (§2.2). Planning per item allows **partial fulfilment**: part from stock, part purchased.

#### Step 5 — Reserve stock (IT Admin, as part of step 4)

- **System:**
  - **Serialized** categories (laptops, monitors…): specific *Available* assets in the chosen warehouse become **Reserved**, one reservation per asset. The status change is conditional, so two requests can never reserve the same unit.
  - **Quantity-tracked** categories (accessories, consumables): a count moves from available to reserved.
  - Each reservation records a *Reserve* stock movement and expires after 14 days (`reservationExpiryDays`).
  - The employee is notified: "Assets reserved for AM-…".
- **Where to manage:** Inventory → **Reservations** (`/inventory/reservations`) or the request page. **Release** returns the stock if plans change.
- **Why:** reserving holds the asset for this employee between review and handover, without issuing it yet.

#### Step 6 — Mark the shortfall for procurement (IT Admin, as part of step 4)

- **When:** stock is missing, short, or not the right specification.
- **Do:** set the **procure quantity** on the item.
- **System:** the item shows "to procure" and the request becomes **Awaiting Procurement**. The line appears in procurement's list of pending lines.
- **Why:** this is the formal hand-off from IT to Procurement. It records exactly how many units must be bought and for which request item.

### 14.7.7 Phase C — Procurement

#### P1 — Raise a purchase requisition (Procurement Officer)

- **When:** a request item is marked "to procure" (request status **Awaiting Procurement**).
- **Where:** Procurement → **Requisitions** (`/procurement/requisitions`) → new requisition.
- **Do:** pick the pending lines from approved requests. Lines from several requests can be grouped into one requisition, and extra lines from the item master can be added. Confirm quantities and estimated prices.
- **System:** creates the requisition (`PR-…`) with status **Open**. Each line keeps its link to the original request item. If a line no longer needs procurement (for example IT reserved stock in the meantime), creation is refused: "refresh and try again".
- **Why:** it turns individual employee needs into a single, traceable buying demand, so procurement can consolidate purchases.

#### P2 — Collect quotations and select a vendor (Procurement Officer)

- **When:** the requisition is Open or in Quotation Stage.
- **Where:** Procurement → **Quotations** (`/procurement/quotations`), or the requisition detail page (`/procurement/requisitions/[id]`).
- **Do:** record one quotation per vendor (active vendors only) with price and tax per requisition line. Compare them, then **select** the winner with a **reason**.
- **System:** the requisition moves to **Quotation Stage**. The chosen quotation becomes **Selected** and the others **Not Selected**. A vendor cannot be selected once an order has been placed.
- **Why:** competitive, documented vendor selection. The recorded reason is the audit evidence for why that vendor was chosen.

#### P3 — Create the purchase order (Procurement Officer)

- **When:** a quotation has been selected.
- **Where:** Procurement → **Purchase Orders** (`/procurement/purchase-orders`). Raise the PO from the selected quotation, or create one directly at `/procurement/purchase-orders/create`.
- **Do:** confirm the vendor, the **delivery warehouse**, the **department (budget)**, the cost centre, the order date and the expected delivery date. Lines and prices come from the quotation. Then **Submit for approval**.
- **System:** creates the PO (`PO-…`), Draft → **Pending Approval**. Only one PO can be raised per quotation. Each PO line keeps its link to the request item. The requisition moves to **Ordered**.
- **Why:** the PO is the company's commitment to spend. The department field ties the spend to that department's budget.

#### P4 — Approve the purchase order (Finance Manager)

- **When:** a PO is **Pending Approval** (the Finance Manager is notified).
- **Where:** Procurement → Purchase Orders → open the PO (`/procurement/purchase-orders/[id]`).
- **Do:** check the vendor, amount and department budget, then **Approve**, or **Reject** with a reason.
- **Rules:** needs `procurement.po.approve`, and the approver **must not be the PO creator**.
- **System:** Approve → **Approved**, and the PO now counts as **committed** spend against the department budget. Reject → back to **Draft** for Procurement to correct and resubmit.
- **Why:** Finance controls spend before money is committed to a vendor (separation of duties).

#### P5 — Send the PO to the vendor (Procurement Officer)

- **When:** the PO is Approved.
- **Where:** the PO detail page → **Send to vendor**.
- **System:** the PO moves to **Sent to Vendor**. Recording a goods receipt against an Approved PO also does this automatically.
- **Why:** it marks that the order has been placed. Invoices can only be entered from this point on.

#### P6 — Receive the goods (IT Admin or Procurement Officer)

- **When:** the vendor delivers, fully or in part.
- **Where:** Procurement → **Goods Receipts** (`/procurement/goods-receipts`).
- **Do:** choose the PO and the receiving warehouse. Enter the quantity received and rejected per line, with a rejection reason for anything refused. For serialized items, enter **one serial number per accepted unit**. Add the delivery-note number.
- **System:**
  - Creates the GRN (`GRN-…`).
  - **Serialized items:** registers each accepted unit in the asset register (tag `AST-…`, cost including tax, warranty end date, linked to PO and vendor).
  - **Quantity items:** adds the units to available stock with a *Receipt* movement.
  - Updates the PO to **Partially Received** or **Fully Received**. A requisition closes when all its POs are done.
  - **Auto-reserves** the accepted units for the original request item, recomputes the request status and notifies the employee: "Your ordered assets have arrived".
- **Why:** goods enter the asset register and stock with a full audit trail. The accepted quantities are what Finance matches the invoice against.

### 14.7.8 Phase D — Finance (runs in parallel with handover)

#### F1 — Enter the vendor invoice (Finance Officer)

- **When:** the vendor's invoice arrives. The PO must be Sent to Vendor, Partially Received, Fully Received or Closed.
- **Where:** Finance → **Invoices** (`/finance/invoices`) → new invoice → choose the PO.
- **Do:** the form is pre-filled from the PO lines. Enter the **vendor invoice number**, invoice date, invoiced quantities, unit price and tax per line. A due date and an attachment reference (where the scanned invoice is stored) are optional.
- **System:** creates the invoice record with status **Received**. The same vendor invoice number cannot be entered twice for the same vendor. If no due date is given, it is calculated from the vendor's **payment terms**.
- **Why:** it records the payable against the exact PO it relates to.

#### F2 — Verify the invoice: three-way match (Finance Officer)

- **When:** the invoice is Received, preferably after the goods receipt. Quantities are matched against **accepted** goods.
- **Where:** the invoice detail page (`/finance/invoices/[id]`) → **Verify**.
- **System checks each line:**
  - invoiced quantity ≤ quantity accepted on goods receipts, minus anything already invoiced;
  - unit price = PO price, within a tolerance of 0.01 (`invoicePriceTolerance`);
  - tax rate = PO tax rate.
- **Outcome:**
  - all checks pass → **Verified** ("3-way match OK");
  - any check fails → **Discrepancy**, with each issue listed. The officer can resolve it with the vendor and verify again, **accept** the discrepancy with a required explanation (→ Verified), or **Reject** the invoice.
- **Why:** the company pays only for what was ordered, at the agreed price, and actually received in acceptable condition.

#### F3 — Approve the invoice for payment (Finance Manager)

- **When:** the invoice is **Verified**.
- **Where:** the invoice detail page → **Approve**, or **Reject** with a reason.
- **Rules:** needs `finance.invoice.approve`, and **the verifier cannot approve** the same invoice.
- **System:** Verified → **Approved**, and the invoice becomes payable.
- **Why:** a second person signs off before money leaves the company (separation of duties).

#### F4 — Record the payment (Finance Officer)

- **When:** the invoice is Approved and payment is made, normally by the due date. Overdue invoices can be filtered on the invoice list.
- **Where:** Finance → **Payments** (`/finance/payments`), or the invoice page → record payment.
- **Do:** enter the payment date, amount, **TDS** withheld (if any), mode (NEFT / RTGS / IMPS / UPI / Cheque / Card / Cash) and the bank or UTR **reference**.
- **System:** creates the payment (`PAY-…`). Payment + TDS cannot exceed the outstanding amount. The invoice becomes **Partially Paid** or **Paid**. The amount is added to the department's **paid** spend in Budgets and in Reports.
- **Why:** the payment record is separate from the invoice (§2.2: approval, procurement, invoice verification and payment are distinct events), and supports part payments and tax deduction.

### 14.7.9 Phase E — Handover

#### Step 7 — Hand over (IT Admin)

- **When:** a unit is reserved for the request, either from stock (step 5) or after a goods receipt (P6). The employee sees the "reserved" or "arrived" notification.
- **Where:** the request detail page (`/requests/[id]`), on each reserved line:
  - **Issue to employee** for a reserved serialized asset. Opens the assignment form: condition, accessories, notes.
  - **Issue stock** for reserved quantity-tracked stock.
- **Rules (serialized assignment):**
  - the asset is Available or Reserved for *this* request item;
  - the recipient is the **requester** and is active;
  - the asset category matches the item;
  - the item is not already fully delivered;
  - the request is in Under IT Review / Awaiting Procurement / Partially Fulfilled.
- **System:**
  - Asset → **Assigned**. The reservation becomes Consumed and stock moves to issued (*Issue* movement).
  - An assignment record stores the issuer, condition and accessories.
  - The item's delivered quantity increases and the request becomes **Partially Fulfilled**.
  - The employee is notified: "Please acknowledge AST-…".
  - Quantity-tracked stock is issued directly and needs no acknowledgement.
- **Why:** a formal handover keeps the asset register accurate (who holds what, in what condition) and keeps assignment history permanently.

#### Step 8 — Acknowledge receipt (Employee)

- **When:** right after physically receiving the asset.
- **Where:** the notification link, **My assets** (`/assets/mine`), or the request page → **I received this**.
- **Rules:** only the employee who received the asset can acknowledge, once, while the assignment is active.
- **System:** records the acknowledgement time and recomputes status. When every unit of every item is delivered **and** every serialized handover is acknowledged, the request becomes **Fulfilled**.
- **Why:** the employee's confirmation closes the loop and is the evidence of handover for audits and exit clearance.

### 14.7.10 Who does what, when (summary)

| # | Who | Trigger (when) | Action | Result |
|---|---|---|---|---|
| N1–N3 ⏳ *PENDING* | HR | New employee joins | Raise and submit onboarding request for the joinee | Pending Approval with the **joinee's manager** |
| 1–2 | Employee | Needs an asset | Create and submit request | Pending Approval |
| 3 | Manager / role approver | Approval notification | Approve / return / reject | Approved (or Returned / Rejected) |
| 4–6 | IT Admin | Request Approved | Review spec, reserve stock, mark shortfall | Under IT Review / Awaiting Procurement |
| P1 | Procurement Officer | Line marked "to procure" | Raise requisition | PR Open |
| P2 | Procurement Officer | PR Open | Record quotations, select vendor | Quotation Selected |
| P3 | Procurement Officer | Quotation selected | Create PO, submit | PO Pending Approval |
| P4 | Finance Manager | PO pending approval | Approve / reject PO | PO Approved (committed to budget) |
| P5 | Procurement Officer | PO Approved | Send to vendor | PO Sent to Vendor |
| P6 | IT Admin / Procurement | Delivery arrives | Goods receipt with serials | Assets registered and reserved for the request |
| F1 | Finance Officer | Vendor invoice arrives | Enter invoice against PO | Invoice Received |
| F2 | Finance Officer | Invoice Received (after GRN) | Three-way match verify | Verified / Discrepancy |
| F3 | Finance Manager | Invoice Verified | Approve invoice | Invoice Approved |
| F4 | Finance Officer | Approved, payment due | Record payment (+TDS) | Partially Paid / Paid |
| 7 | IT Admin | Unit reserved | Issue to employee | Partially Fulfilled |
| 8 | Employee | Asset received | "I received this" | **Fulfilled** |

### 14.7.11 Exception paths

| Situation | Who | What happens |
|---|---|---|
| Employee changes their mind | Employee | **Cancel** (Draft, Pending Approval, Returned, Approved). Open tasks are skipped and items are cancelled |
| Request needs changes | Approver → Employee | **Return** with a comment → employee edits and resubmits → new approval cycle |
| Request not justified | Approver | **Reject** with a comment, which is final |
| Plan changes after reserving | IT Admin | **Release** the reservation; stock goes back to available and the request status is recomputed |
| Requisition no longer needed | Procurement Officer | **Cancel** the requisition (Open / Quotation Stage) with a reason |
| PO rejected by Finance | Finance Manager → Procurement | PO goes back to **Draft** for correction and resubmission |
| Order must be stopped | Procurement Officer | **Cancel** the PO with a reason, only before any goods are received; otherwise **Close** it |
| Damaged or short delivery | IT Admin / Procurement | Record the rejected quantity and reason on the GRN; the PO stays Partially Received until the rest arrives |
| Invoice doesn't match PO / GRN | Finance Officer | Invoice goes to **Discrepancy**; resolve with the vendor, accept with an explanation, or reject |
| Wrong or duplicate invoice | Finance Officer / Manager | **Reject** the invoice; a duplicate vendor invoice number is blocked at entry |
| No approver can be found | System | Falls back to Administrators (see step 2); fails only if none exist |

### 14.7.12 Test script for one account (Administrator)

An `ADMINISTRATOR` holds every permission, so one account can run almost the whole flow. Two steps need **a second account**, because the separation-of-duties rules block self-approval:
- **PO approval (P4):** use an account with `procurement.po.approve`, for example a Finance Manager.
- **Invoice approval (F3):** use an account with `finance.invoice.approve` other than the person who verified the invoice.

1. **Asset Requests → New request**: add a serialized item (e.g. a laptop) and **Submit**. With no manager set, the approval task comes back to you.
2. **Approvals**: open the task and **Approve**. Status becomes Approved.
3. **Asset Requests → IT queue**: open the request.
   - *Stock path:* reserve 1 unit from a warehouse that has stock, then go to step 8.
   - *Procurement path:* set procure quantity 1. Status becomes Awaiting Procurement.
4. **Procurement → Requisitions**: create a requisition from the pending line.
5. **Quotations**: add a quotation and **select** it with a reason.
6. **Purchase Orders**: create the PO from the quotation and submit it. *Second account:* **Approve**. Then **Send to vendor**.
7. **Goods Receipts**: receive 1 unit with a serial number. The new asset is auto-reserved for the request.
8. On the request page, **Issue to employee**. Status becomes Partially Fulfilled.
9. Click **I received this**. Status becomes **Fulfilled**.
10. **Finance → Invoices**: enter the vendor invoice for the PO, then **Verify** (three-way match). *Second account:* **Approve**.
11. **Finance → Payments**: record the payment. The invoice becomes **Paid**. Check **Finance → Budgets** for the committed and paid amounts.

### 14.7.13 New-joinee onboarding request by HR ⏳ PENDING — TO BE DEVELOPED

> **Status: not implemented.** This section records the agreed business flow so it can be built later. None of steps N1–N3 exist in the application yet. Today, only an employee can raise a request for themselves.

**Purpose:** when a new employee joins, HR arranges their standard starter asset (for example a laptop or tablet) before or on the joining day. The new joinee does not have to raise the request themselves.

#### Planned steps

| # | Who | When | Where (planned) | Do | System (planned) | Why |
|---|---|---|---|---|---|---|
| N1 | HR / Administrator | A new employee is added to `users` (joining date known) | Administration → Users & Access | Make sure the joinee's record is **active** and has a **reporting manager** and department | — (uses the existing users table; no new employee master, §2.1) | The joinee's manager is the approver, so the manager link must exist first |
| N2 | HR | Before or on the joining date | Asset Requests → **New onboarding request** (new screen or a "Request for" field) | Choose the **new joinee** as the beneficiary, request type *New Asset*, and pick the starter items (laptop / tablet, accessories) | Creates the request with **requester = HR user** and **beneficiary = new joinee**. Request number, items and audit are the same as step 1 | HR owns onboarding readiness; the joinee may not have system access yet |
| N3 | HR | Request is complete | Request page → **Submit** | Submit for approval | Selects the workflow using the **joinee's** department, and routes the manager stage to the **joinee's reporting manager**, not HR's manager. Notifies the manager, and optionally the joinee | The manager confirms the starter kit fits the joinee's role |
| → | Joinee's manager, then same as today | Approval notification | Approvals | **Step 3 onwards, unchanged**: approve / return / reject, IT review, stock or procurement, finance | — | Re-uses the existing flow; no separate process to maintain |

From step 3 onwards, everything works as described above. The only difference is that the **new joinee** is the person who receives the asset in step 7 and acknowledges it in step 8.

#### Development notes (what has to change)

| Area | Today | Needed for onboarding |
|---|---|---|
| Role | No `HR` role in `shared/config/roles.config.ts` | Add an `HR` role and a permission such as `request.create.on_behalf` to `permissions.config.ts` |
| Data model | `hardware_requests.requester_user_id` = the person who raised it, and also the person who receives it | Add `beneficiary_user_id` (FK → `users`) via a migration. It defaults to the requester for normal requests |
| Request form | Requester is always the signed-in user | "Request for" picker (active users, HR only), plus an onboarding request type or flag |
| Approval routing | `startApproval` / `resolveApprovers` use the **requester's** manager and department | Use the **beneficiary's** manager and department. The self-approval check must exclude both HR and the beneficiary |
| Submit / edit / cancel | Only the requester may submit, edit or cancel | HR (requester) may submit, edit and cancel; the beneficiary may view |
| Visibility | "My requests" = requests the user raised | The beneficiary also sees requests raised for them |
| Handover | `assignAsset` requires recipient = **requester** | Require recipient = **beneficiary** |
| Acknowledgement | Assignee acknowledges | Unchanged: the joinee acknowledges, which means they need a login by then |
| Notifications | Sent to the requester | Approval outcome → HR **and** joinee; "asset ready" → joinee (and HR) |
| Trigger (optional) | — | Auto-create a draft onboarding request when a user with a future joining date is added |

#### Open decisions

1. Does HR need its own approval stage, or does the joinee's manager approve alone? (Default assumption: manager only, then the existing workflow.)
2. Should onboarding use a dedicated request type and workflow, for example "Onboarding", with a standard kit per department or designation?
3. What happens if the joinee has no reporting manager yet: block submission, or use the Administrator fallback (§14.7.5, step 2)?
4. Can IT hand over before the joining date, or only from the joining date?

---

# 15. Status Management

Use centrally defined status constants rather than scattering status strings throughout the code.

Suggested request statuses:

- Draft
- Submitted
- Pending Approval
- Returned for Changes
- Rejected
- Approved
- Under IT Review
- Awaiting Procurement
- Partially Fulfilled
- Fulfilled
- Cancelled

Suggested approval statuses:

- Pending
- Approved
- Rejected
- Returned
- Delegated
- Skipped

Suggested asset statuses:

- Available
- Reserved
- Assigned
- Under Maintenance
- Damaged
- Retired
- Disposed

Suggested purchase order statuses:

- Draft
- Pending Approval
- Approved
- Sent to Vendor
- Partially Received
- Fully Received
- Cancelled
- Closed

Suggested maintenance statuses:

- Open
- Assigned
- In Progress
- Waiting for Parts
- Resolved
- Closed

Only valid status transitions should be accepted by the service layer.

---

# 16. Audit and Record History

Maintain audit history for important actions:

- Request creation and changes
- Approval and rejection
- IT review
- Stock reservation and release
- Stock movements
- Asset registration
- Assignment and return
- Vendor selection
- Purchase order approval
- Invoice verification
- Payment recording
- Role and permission changes
- Workflow configuration changes

Audit records should include:

- Actor user ID
- Action
- Entity type
- Entity ID
- Timestamp
- Relevant before/after values
- Request correlation ID where applicable

Do not store passwords, authentication tokens or sensitive secrets in audit logs.

Restrict audit access to authorized users.

---

# 17. Security Requirements

- Use existing organizational authentication where available.
- Prefer organizational SSO if supported.
- Secure session handling and expiration.
- HTTPS for deployed environments.
- Server-side permission enforcement.
- Record-level authorization.
- Input validation and output encoding.
- Protection against SQL injection, XSS and CSRF where applicable.
- Rate limiting on sensitive endpoints where appropriate.
- Secure file upload validation.
- File size and extension restrictions.
- Malware scanning where infrastructure supports it.
- Private storage for uploaded documents.
- No public exposure of invoices or employee documents.
- Secrets must not be committed to source control.
- Restrict administrative actions.
- Maintain audit history for security-sensitive changes.

---

# 18. Non-Functional Requirements

## Performance

- Paginate large lists.
- Index frequently filtered columns.
- Avoid N+1 database queries.
- Use appropriate SQL Server query plans and indexes.
- Use background jobs for email, reminders and large exports.
- Avoid unnecessary dashboard queries.
- Test with realistic organization data and concurrent users.

## Reliability

- Database backup schedule.
- Restore testing.
- Disaster recovery plan.
- Error logging.
- Health checks.
- Monitoring.
- Documented deployment and rollback procedures.

## Usability

- Responsive desktop and mobile-browser layout.
- Clear status indicators.
- Consistent page layouts.
- Accessible forms.
- Keyboard navigation.
- Helpful validation messages.
- Confirmation for destructive actions.
- Loading, empty and error states.

## Maintainability

- TypeScript strict mode where practical.
- Reusable shared components.
- Modular service architecture.
- Source-controlled migrations.
- Automated unit, integration and end-to-end tests.
- Documented APIs.
- Centralized configuration.
- Consistent naming conventions.

---

# 19. On-Premise Deployment

The system will run on organization-managed infrastructure.

Suggested production components:

```text
Internal Users
     |
     v
Internal DNS / HTTPS
     |
     v
Reverse Proxy
     |
     v
Next.js Application Server
     |
     +--------------------+
     |                    |
     v                    v
SQL Server           Private File Storage
     |
     v
Database Backup
```

Deployment requirements:

- Organization-managed server or VM.
- Supported Node.js runtime.
- Production build of Next.js.
- SQL Server connectivity.
- Internal DNS.
- TLS certificate.
- Firewall rules.
- Private document storage.
- SMTP or internal notification service.
- Database backup and restore process.
- Application logging and monitoring.

Do not store uploaded invoices, quotations or handover documents in a publicly accessible directory.

Use environment-specific configuration for development, staging and production.

---

# 20. Testing Strategy

## Unit tests

Test:

- Permission calculation
- Request validation
- Approval rules
- Status transitions
- Stock availability
- Reservation rules
- Asset assignment rules
- Invoice calculations
- Workflow conditions

## Integration tests

Test:

- SQL Server connectivity
- Prisma queries
- Foreign-key relationships
- Transactions
- Permission enforcement
- Request and approval APIs
- Inventory reservation
- Asset assignment
- Procurement and finance flows

## End-to-end tests

### Scenario A — Stock available

1. Employee signs in.
2. Employee creates laptop request.
3. Request enters configured approval workflow.
4. Approvers approve.
5. IT finds compatible stock.
6. IT reserves an asset.
7. IT assigns the asset.
8. Employee acknowledges.
9. Request becomes fulfilled.

### Scenario B — Procurement required

1. Employee submits request.
2. Required approvals complete.
3. IT confirms stock is unavailable.
4. Procurement collects quotations.
5. Authorized user selects vendor.
6. Purchase order is approved.
7. Goods are received.
8. Asset is registered.
9. Invoice is verified.
10. Payment is recorded.
11. Asset is assigned.

### Scenario C — Mixed fulfilment

1. Employee requests multiple items.
2. Some items are available.
3. Other items require procurement.
4. Stock items are reserved.
5. Procurement items follow the purchase workflow.
6. Request remains partially fulfilled until all items are resolved.

### Scenario D — Permission enforcement

1. Employee A cannot access Employee B's request by changing the URL.
2. A manager sees only authorized team records.
3. A user without Finance permission cannot access Finance APIs.
4. A user cannot approve a task not assigned to them or otherwise delegated.
5. Hiding an action in the UI does not bypass backend checks.

### Scenario E — Asset return

1. HR initiates exit clearance.
2. IT sees the employee's active assignments.
3. Assets are returned.
4. IT records condition and accessories.
5. Asset status is updated.
6. Historical assignment remains intact.

## Quality gates

Before production:

- Unit tests pass.
- Integration tests pass against SQL Server.
- End-to-end workflows pass.
- Permission and record-scope tests pass.
- Concurrency tests pass for stock reservation.
- Migration tested against a database copy.
- Backup restore tested.
- UAT completed by Employee, HR, IT, Finance and Procurement.
- Security review completed.

---

# 21. Implementation Phases

## Phase 1 — Foundation

- Inspect current codebase.
- Inspect existing users and authentication.
- Inspect SQL Server schema.
- Establish Next.js Pages Router structure.
- Configure TypeScript and Tailwind CSS.
- Configure Prisma and SQL Server.
- Implement migrations.
- Implement permission configuration.
- Implement permission seed.
- Implement database-backed roles.
- Implement configuration-driven sidebar.
- Implement authentication and authorization.

## Phase 2 — Employee Requests and Approvals

- Employee dashboard.
- Request creation.
- Multi-item request.
- Specification templates.
- Request details.
- Approval workflow configuration.
- Approval inbox.
- Approve/reject/return actions.
- Approval history.

## Phase 3 — IT and Inventory

- IT dashboard.
- IT technical review.
- Inventory master.
- Stock availability.
- Stock reservation.
- Partial fulfilment.
- Asset registration.
- Asset assignment.
- Employee acknowledgement.
- Asset return.

## Phase 4 — Procurement and Finance

- Vendor management.
- Quotation management.
- Quotation comparison.
- Purchase requisitions.
- Purchase orders.
- Purchase approval.
- Goods receipt.
- Invoice verification.
- Payment recording.

## Phase 5 — Maintenance and Notifications

- Maintenance ticket creation.
- Technician assignment.
- Repair activities.
- Resolution.
- In-app notifications.
- Email notifications.
- Reminders and escalation.

## Phase 6 — Reporting and Production Readiness

- Operational dashboards.
- Reports and exports.
- Audit viewer.
- Performance testing.
- Security testing.
- Backup and restore.
- On-premise deployment.
- User acceptance testing.

---

# 22. Immediate Developer Action Plan

Complete these steps before writing the main business modules:

1. Inspect the existing repository and package versions.
2. Inspect the current Next.js or frontend/backend setup.
3. Inspect the existing SQL Server database.
4. Inspect the actual `users` table and primary-key type.
5. Identify existing authentication and RBAC tables.
6. Identify existing department, manager, location and cost-centre tables.
7. Decide which existing tables must be reused.
8. Create a schema mapping document.
9. Configure Next.js Pages Router and Tailwind CSS.
10. Configure Prisma for SQL Server.
11. Create the initial database migrations.
12. Create `config/permissions.config.ts`.
13. Implement idempotent `npm run seed`.
14. Create `config/sidebar.config.ts`.
15. Implement backend authorization.
16. Implement the shared layout and reusable UI components.
17. Build the employee request-to-approval-to-stock-to-assignment workflow.
18. Test permissions and record-level access.
19. Add procurement and Finance.
20. Add maintenance, notifications and reporting.

---

# 23. Decisions Required Before Production

| Topic | Required decision |
|---|---|
| Existing users schema | Actual SQL Server table definition and primary key |
| Authentication | Existing session, JWT or SSO implementation |
| Existing RBAC | Reuse existing role and permission tables or extend them |
| Organization structure | Existing department, manager and location relationships |
| Approval thresholds | Amount bands and request-type rules |
| HR approval | Which request types require HR review |
| Finance process | Budget approval, invoice approval and payment approval stages |
| Stock policy | Reservation expiry and partial fulfilment rules |
| Asset policy | Serialized versus quantity-tracked categories |
| Assignment | Acknowledgement method and handover document |
| Exit workflow | HR trigger and asset clearance ownership |
| Tax/accounting | Invoice and tax requirements |
| Hosting | Server sizing, DNS, TLS, backup and disaster recovery |
| Notifications | Internal SMTP, templates and escalation |
| Retention | Business records, attachments and audit retention |

---

# 24. Final Architecture Guardrails

1. **Next.js + TypeScript is the application framework.**
2. **Use the Pages Router and keep all pages under `pages/`.**
3. **Use Next.js API Routes under `pages/api/`.**
4. **Use Microsoft SQL Server as the database.**
5. **Use Tailwind CSS and reusable shared components.**
6. **Use Prisma with a validated, pinned SQL Server-compatible version.**
7. **Run production migrations through `npm run migrate`.**
8. **Keep permission definitions in `config/permissions.config.ts`.**
9. **Synchronize the permission catalogue through `npm run seed`.**
10. **Keep role assignments and role permissions database-backed and explicitly configured.**
11. **Drive sidebar navigation from `config/sidebar.config.ts`.**
12. **Filter sidebar entries by effective permissions, but always enforce authorization on the server.**
13. **The existing `users` table remains the only employee master.**
14. **All user foreign keys must match the real existing users primary-key type.**
15. **Do not recreate or destructively modify existing authentication or employee data.**
16. **Preserve approval, asset, procurement, finance and audit history.**
17. **Build the first vertical slice: employee request → approval → IT stock check → asset assignment → employee acknowledgement.**

**The existing `users` table is the source of truth for employee identity. Every new HMS feature must integrate with it rather than creating a duplicate employee master.**
