# Hardware Management System (HMS)

Next.js (Pages Router) + TypeScript + Tailwind on Microsoft SQL Server, using plain
parameterized SQL through `mssql` (no ORM) and numbered `.sql` migrations.
It manages IT hardware end to end: employee request → approval → IT review → stock
reservation or procurement (quotations, purchase order, goods receipt) → assignment and
acknowledgement → invoices and payments → maintenance → return, with reports across all of it.
See `doc/PRD.md` for the full blueprint and `doc/DESIGN.md` for the visual system.

> ⚠️ Read `docs/schema-mapping.md` before pointing this at a real database. The
> existing `users` table structure is **assumed** and must be confirmed.

## What's built

| Area | What it covers |
|---|---|
| Foundation | SQL Server (`mssql`) + SQL migrations, permission catalogue + seed, config-driven sidebar, server-side authz, CSRF/origin checks, audit log |
| Requests | Multi-item create/edit/draft/submit/cancel; items picked from the item master; record-level visibility; **My assets** tab on `/requests` |
| Approvals | Versioned, configurable workflows (manager / role stages, parallel stages, amount/type/department conditions), approve/reject/return, history |
| IT review | Spec confirmation, per-warehouse stock reservation (race-safe), procurement shortfall, partial fulfilment |
| Assets | Registration with tag generation, register, detail/lifecycle, assignment, employee acknowledgement, return with next status |
| Inventory | Stock by category × warehouse, consumable receipts/adjustments, reservations, movement history |
| Item master | Items (code, name, category, type, make/model, part no., UoM, HSN, standard cost, warranty, reorder level); add/edit/soft delete; live duplicate check; CSV bulk upload with sample sheet |
| Procurement | Vendors; purchase requisitions (from request lines marked "to procure" or ad hoc); multiple quotations with side-by-side comparison and vendor selection; purchase orders (draft → approval → sent → received → closed); goods receipt that registers serialized assets / adds stock and **auto-reserves** units bought for a request |
| Finance | Department budgets per fiscal year (committed vs paid); invoice entry with **3-way match** (PO price × accepted GRN quantity × invoice), discrepancy handling, approval (separate from verification), payments with UTR and TDS |
| Maintenance | Employees report issues against their assets; technician assignment; SLA due by priority; diagnosis/repair log with hours; spare parts and cost; take asset into repair store; resolve, confirm/close, reopen; repeat-issue flag |
| Reports | 16 reports (requests by status, pending approvals, approval turnaround, item demand, department/category spend, vendor summary, invoice & payment summary, inventory availability, stock ageing, asset assignments/returns, warranty expiry, maintenance history, technician SLA, audit activity) with date/department filters, sorting, totals and CSV export |
| Other | In-app notifications, dashboard, admin (roles from config, per-user role + permissions, workflows, master data, audit viewer) |

Not built yet: email notifications, escalation/reminder jobs, file uploads (invoice
attachments are stored as a document reference), budget approval workflow.

## Getting started (local)

Requires Node 20.12+ and a SQL Server you can create a database on (for example SQL Server
Developer or Express, or the `mcr.microsoft.com/mssql/server` container).

```bash
cp .env.example .env.local      # set the DB_* values and SESSION_SECRET
npm install
npm run migrate                 # creates IT_Assest_manager if missing, applies database/migrations
npm run seed                    # syncs config/permissions.config.ts → permissions table
npm run seed:dev                # DEV ONLY: demo users, roles, workflow, items, stock
npm run dev
```

Sign in (dev mode) with an employee code:

| Code | Who | Try |
|---|---|---|
| `EMP001` | Aisha, employee | Create and submit a request; acknowledge the laptop; report an issue in **Maintenance** |
| `EMP002` | Rahul, Aisha's manager | Approve it in **Approvals** |
| `EMP003` | Priya, IT admin | IT review → reserve or mark for procurement → *Issue to employee*; receive goods; work tickets |
| `EMP004` | Sam, super admin | User access, workflows, master data, item master, audit logs |
| `ADMIN` | Administrator | Every permission — try the full procure-to-pay flow below |

**Procure-to-pay walkthrough:** IT review marks quantity to procure → **Procurement →
Requisitions** → *Requisition* the waiting line → record 2–3 quotations → *Select* →
*Raise purchase order* → *Submit* → approve as a **different** user with
`procurement.po.approve` → *Mark sent* → *Receive goods* (serials become assets reserved
for the request) → **Finance → Invoices** → *Enter invoice* → *Verify* → approve as a
different user → *Record payment*.

## Roles

Roles live in `config/roles.config.ts` (not in the database). Assigning a role copies its
default permissions to the user; they can then be adjusted per user.

| Role | Main access |
|---|---|
| Employee | Own requests, own assets, report maintenance issues |
| Reporting Manager | Employee + approve requests |
| IT Admin | IT review, inventory, assets, item master (no delete), goods receipt, maintenance, reports |
| Procurement Officer | Vendors, requisitions, quotations, purchase orders, goods receipt |
| Finance Officer | Budgets, invoice entry/verification, payments |
| Finance Manager | Budgets, approve purchase orders and invoices |
| Technician | Maintenance tickets, asset register, inventory view |
| Auditor | Read-only records, audit log, reports |
| Super Admin | User access, workflows, master data, item master |
| Administrator | Every permission |

Separation of duties is enforced in the services: a PO can't be approved by its creator, and
an invoice can't be approved by the person who verified it.

## Scripts

| Command | Purpose |
|---|---|
| `npm run migrate` | Create the database if missing, then apply pending `database/migrations/*.sql` (each in its own transaction) |
| `npm run migrate:status` | List each migration as applied / pending / EDITED / missing |
| `npm run migrate:new add_x_col` | Create the next numbered file, e.g. `0013_add_x_col.sql` |
| `npm run seed` | Idempotent permission catalogue sync. A permission inserted for the first time is granted to existing users whose role includes it by default; existing permissions are never granted or revoked |
| `npm run seed:dev` | Demo data. Refuses unless `AUTH_MODE=dev` and not production |
| `npm run typecheck` / `npm test` / `npm run build` | Quality gates |

**After adding a permission** to `config/permissions.config.ts`, run `npm run seed` — the
sidebar and API checks read permissions from the database, so a new menu stays hidden
until it is synced.

## Architecture

```
pages/            UI pages (getServerSideProps → withPageAuth) and pages/api/v1/* thin route handlers
  procurement/    requisitions, quotations, purchase-orders, goods-receipts, vendors
  finance/        invoices, payments, budgets
  maintenance/    ticket list + detail
  masters/        item master
  reports/        report runner
components/       common/ (Button, FormField, DataTable, Modal, StatusBadge, Workflow helpers, …),
                  layout/, requests/, assets/, items/
config/           permissions · roles · sidebar · status (statuses + transitions) · app (prefixes,
                  tax rates, SLA hours, fiscal year, …)
server/
  middleware/     withApi (authn, permission, origin check, error mapping) · authorize
  services/       request · approval · inventory · asset · item · procurement · finance ·
                  maintenance · reports · admin · dashboard · notification
                  workflow-rules / fulfilment-rules / procurement-rules (pure, unit-tested)
  validators/     zod schemas
  utils/          sql-columns, audit, numbering (PR-/PO-/GRN-/INV-/PAY-/MT-YYYY-NNNNNN)
lib/              db (pool + query helpers), auth (integration point), session, api-response,
                  client helpers, item-sheet (CSV), download
config/db-config.mjs  connection settings from DB_* env vars (shared by the app, migrations and seeds)
database/         migrations/NNNN_name.sql, seed.ts, dev/seed-dev.ts, create-app-login.sql
scripts/          migrate.mjs (migration runner)
doc/              PRD.md, DESIGN.md
docs/             schema-mapping.md
```

Key rules this code enforces:

- **Server-side authorization everywhere.** Every API route declares a permission, and
  services add record-level checks: only the requester edits, only the assigned approver
  acts, only the assignee acknowledges, reporters see only their own tickets. Hiding a UI
  button is never the only control.
- **Actor identity comes from the session**, never from the request body.
- **Multi-table operations run in transactions.** Stock and asset changes use
  conditional `UPDATE … WHERE` statements, backed by filtered unique indexes and CHECK
  constraints, so concurrent reservations cannot oversell.
- **Statuses only move along defined transitions** (`config/status.config.ts`) for
  requests, assets, purchase orders, invoices and maintenance tickets.
- **Money is `DECIMAL(18,2)`** and rounded consistently (`procurement-rules.money`).
- **Workflows are versioned.** Each request stores the version it used, and editing a
  workflow creates a new version.
- **History is preserved.** Assignments are closed rather than deleted, items are
  soft-deleted, invoice verification/approval events and approval history are
  append-only, and every change is written to the audit log.

## Configuration worth reviewing

`config/app.config.ts` holds the business settings: document number prefixes, fiscal year
start month (April), GST rates offered on lines, payment modes, invoice price tolerance,
maintenance SLA hours per priority, repeat-issue window, item types and units of measure,
and the bulk-upload row limit.

## Database access

Request path: page → `fetch('/api/v1/...')` → route handler → service → `lib/db.ts` → SQL Server.

- `config/db-config.mjs` builds the connection from `DB_SERVER`, `DB_PORT`, `DB_DATABASE`
  (default `IT_Assest_manager`), `DB_AUTH` (`sql` or `windows`), `DB_USER`, `DB_PASSWORD`,
  `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE`. Named instances (`host\SQLEXPRESS`) work.
  Windows auth needs `npm install msnodesqlv8`.
- `lib/db.ts` keeps one pool (survives dev hot reloads, never caches a failed connection) and
  provides `query`, `queryOne`, `queryMany` (several SELECTs in one round trip), `execute`
  and `withTransaction`. Parameters are always bound; an array parameter expands for
  `IN (@ids)`. Aliases like `u.full_name AS [requester.fullName]` become nested objects, so
  the API keeps returning the same JSON shapes.
- `next.config.js` lists the drivers in `serverExternalPackages` so Next loads them with
  Node's `require` instead of bundling them.
- SQL errors map to API responses in `server/middleware/authenticate.ts`: unique-key and
  constraint violations → 409, connection failures → 503, anything else → 500 (logged).

## Migrations and the existing `users` table

`scripts/migrate.mjs` applies `database/migrations/NNNN_name.sql` in order, each in its own
transaction, split on `GO` lines like SSMS. It records a SHA-256 of every applied file in
`dbo.SchemaMigrations` and refuses to run if an applied file was edited: fix mistakes with a
new migration. An app lock (`sp_getapplock`) stops two terminals migrating at once.
Migrations are idempotent (`IF OBJECT_ID(...) IS NULL` / `IF COL_LENGTH(...) IS NULL`),
constraints are named, and timestamps are UTC (`SYSUTCDATETIME()`).

| Migration | Adds |
|---|---|
| 0001–0008 | Users/permissions, master data, workflows, requests, approvals, assets, inventory, notifications/audit |
| 0009 | `item_master`; `hardware_request_items.item_id` |
| 0010 | Vendors, requisitions, quotations, purchase orders, goods receipts; asset ↔ PO line/vendor link |
| 0011 | Budgets, invoices (+ lines, events), payments |
| 0012 | Maintenance tickets, activities, parts |

Two logins: migrations use `DB_MIGRATE_USER` / `DB_MIGRATE_PASSWORD` when set; the app uses
`DB_USER`, which `database/create-app-login.sql` (run once by hand) limits to
`db_datareader` + `db_datawriter`.

`0001_users_and_permissions.sql` creates `users` **only if it doesn't exist**, so it never
recreates the organization's real table; on an existing table it only adds the `role` and
`permissions` columns. Read `docs/schema-mapping.md` before running it on a shared database.

## Design

Tokens from `doc/DESIGN.md` live in `tailwind.config.ts`: fuchsia primary used only on
interactive elements, Poppins/Nunito/Space Mono, 12/16/24px radii, pill buttons and
layered shadows. Small uppercase labels use the `.eyebrow` class (not `overline`, which is
a Tailwind utility that draws a line above text). Fonts load from Google Fonts; self-host
them for air-gapped deployments.

## Known follow-ups

- Confirm the real `users`/auth/RBAC schema (see `docs/schema-mapping.md`).
- File uploads (request attachments, handover documents, invoice scans) need private storage.
- Email notifications; delegation, escalation and reminder jobs; reservation-expiry release job.
- Budget approval workflow and budget checks before PO approval.
- Asset register is not yet linked to the item master (assets are keyed by category).
- `npm audit` flags advisories in transitive dev/build tooling (postcss inside next,
  and zod 3). The fixes need major upgrades (Next 16, Zod 4), so they are deferred for a
  deliberate upgrade.
- Integration and end-to-end tests against a real SQL Server (PRD §20).
