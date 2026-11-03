# Assets  Management System (HMS)

Next.js (Pages Router) + TypeScript + Tailwind on Microsoft SQL Server, using plain
parameterized SQL through `mssql` (no ORM) and numbered `.sql` migrations.
It manages IT Assets  end to end: employee request → approval → IT review → stock
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
npm run seed                    # syncs shared/config/permissions.config.ts → permissions table
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

Roles live in `shared/config/roles.config.ts` (not in the database). Assigning a role copies its
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

**After adding a permission** to `shared/config/permissions.config.ts`, run `npm run seed` — the
sidebar and API checks read permissions from the database, so a new menu stays hidden
until it is synced.

## Architecture — modules

The code is organised by **business module**. Each module owns its API handlers, service,
validation, types and UI; reusable UI lives in `components/`, reusable code in `shared/`,
and request middleware in `middlewares/`.

```
modules/
  <module>/
    <module>.api.ts          API route handlers (one named export per route)
    <module>.service.ts      business logic + SQL (server only)
    <module>.validation.ts   zod schemas for request bodies / query strings
    <module>.types.ts        types (inferred inputs, domain types)
    <module>.rules.ts        pure rules, unit-tested (where the module has them)
    pages/                   the module's screens (React components)
      components/            UI used only by this module (forms, modals, panels)

  auth            login / logout / current user
  dashboard       dashboard
  requests        Assets  requests, IT review, fulfilment rules
  approvals       approval tasks, workflow routing rules
  assets          asset register, assignment, return, my assets
  inventory       stock, reservations, movements
  items           item master (+ CSV bulk upload: items.sheet.ts)
  procurement     vendors, requisitions, quotations, purchase orders, goods receipts
  finance         budgets, invoices (3-way match), payments
  maintenance     tickets, SLA
  reports         report registry + runner
  notifications   in-app notifications
  admin           roles view, user access, workflows, master data, audit log

components/       reusable UI: common/ (Button, FormField, DataTable, Modal, StatusBadge,
                  Workflow helpers, …) and layout/ (MainLayout, Sidebar, Header)
shared/           reusable code: db, auth, session, api-response, client (browser fetch),
                  errors, validation (parse + shared field schemas), permissions, money, csv,
                  download, audit, numbering, sql-columns, logger
  config/         permissions · roles · sidebar · status (statuses + transitions) · app
                  (prefixes, tax rates, SLA hours, fiscal year, …) · db-config.mjs
middlewares/      authenticate (withApi: authn, permission, origin check, error mapping),
                  authorize (permission helpers), page-auth (withPageAuth for pages)
pages/            Next.js routes only — thin files, no logic (see below)
database/         migrations/NNNN_name.sql, seed.ts, dev/seed-dev.ts, create-app-login.sql
scripts/          migrate.mjs (migration runner)
tests/unit/       vitest unit tests
doc/              PRD.md, DESIGN.md · docs/ schema-mapping.md
```

### Why `pages/` still exists

Next.js (Pages Router) only creates routes from files in the root `pages/` folder, and it
only strips server code (`getServerSideProps` and what it imports, e.g. the SQL driver) from
the browser bundle when that code is **in the `pages/` file itself**. So each route file is a
few lines that point at the module:

```ts
// pages/finance/payments.tsx
import { withPageAuth } from "@/middlewares/page-auth";
export { default } from "@/modules/finance/pages/PaymentsPage";
export const getServerSideProps = withPageAuth(["finance.payment.manage", "finance.invoice.approve"]);

// pages/api/v1/payments/index.ts
export { paymentsHandler as default } from "@/modules/finance/finance.api";
```

Rules of thumb:

- **Never import a `*.service.ts`, `shared/db`, `shared/auth` or `middlewares/authenticate`
  from a component in `modules/*/pages/`** — that pulls server code into the browser. Pages
  talk to the server only through `/api/v1/*` (`shared/client`). Type-only imports are fine.
- **Server code (`*.service.ts`, `*.rules.ts`, `*.validation.ts`, `shared/`) uses relative
  imports**, so the seed scripts and unit tests can load it without the `@/` alias. UI code and
  route files use `@/`.
- **Adding a page:** create `modules/<m>/pages/XPage.tsx`, then `pages/<route>.tsx` with the
  three lines above. **Adding an API route:** export `xHandler = withApi({...})` from
  `<m>.api.ts`, validate with a schema from `<m>.validation.ts`, then add
  `pages/api/v1/<route>.ts` re-exporting it. A route that needs `export const config`
  (body size limit) keeps that line in its `pages/api` file — Next reads it from there.
- Tailwind scans `pages/`, `components/` and `modules/` for class names.
Key rules this code enforces:

- **Server-side authorization everywhere.** Every API route declares a permission, and
  services add record-level checks: only the requester edits, only the assigned approver
  acts, only the assignee acknowledges, reporters see only their own tickets. Hiding a UI
  button is never the only control.
- **Actor identity comes from the session**, never from the request body.
- **Multi-table operations run in transactions.** Stock and asset changes use
  conditional `UPDATE … WHERE` statements, backed by filtered unique indexes and CHECK
  constraints, so concurrent reservations cannot oversell.
- **Statuses only move along defined transitions** (`shared/config/status.config.ts`) for
  requests, assets, purchase orders, invoices and maintenance tickets.
- **Money is `DECIMAL(18,2)`** and rounded consistently (`shared/money.ts`).
- **Workflows are versioned.** Each request stores the version it used, and editing a
  workflow creates a new version.
- **History is preserved.** Assignments are closed rather than deleted, items are
  soft-deleted, invoice verification/approval events and approval history are
  append-only, and every change is written to the audit log.

## Configuration worth reviewing

`shared/config/app.config.ts` holds the business settings: document number prefixes, fiscal year
start month (April), GST rates offered on lines, payment modes, invoice price tolerance,
maintenance SLA hours per priority, repeat-issue window, item types and units of measure,
and the bulk-upload row limit.

## Database access

Request path: page → `fetch('/api/v1/...')` → route file → `modules/<m>/<m>.api.ts` → `<m>.service.ts` → `shared/db.ts` → SQL Server.

- `shared/config/db-config.mjs` builds the connection from `DB_SERVER`, `DB_PORT`, `DB_DATABASE`
  (default `IT_Assest_manager`), `DB_AUTH` (`sql` or `windows`), `DB_USER`, `DB_PASSWORD`,
  `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE`. Named instances (`host\SQLEXPRESS`) work.
  Windows auth needs `npm install msnodesqlv8`.
- `shared/db.ts` keeps one pool (survives dev hot reloads, never caches a failed connection) and
  provides `query`, `queryOne`, `queryMany` (several SELECTs in one round trip), `execute`
  and `withTransaction`. Parameters are always bound; an array parameter expands for
  `IN (@ids)`. Aliases like `u.full_name AS [requester.fullName]` become nested objects, so
  the API keeps returning the same JSON shapes.
- `next.config.js` lists the drivers in `serverExternalPackages` so Next loads them with
  Node's `require` instead of bundling them.
- SQL errors map to API responses in `middlewares/authenticate.ts`: unique-key and
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
| 0009 | `item_master`; `Assets _request_items.item_id` |
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
