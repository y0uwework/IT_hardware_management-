# Hardware Management System (HMS)

Next.js (Pages Router) + TypeScript + Tailwind on Microsoft SQL Server, using plain
parameterized SQL through `mssql` (no ORM) and numbered `.sql` migrations.
It manages hardware from an employee's request through approval, IT stock check,
reservation, assignment, acknowledgement and return. See `PRD.md` for the full
blueprint and `DESIGN.md` for the visual system.

> ⚠️ Read `docs/schema-mapping.md` before pointing this at a real database. The
> existing `users` table structure is **assumed** and must be confirmed.

## What's built (Phase 1 + first vertical slice)

| Area | Status |
|---|---|
| Foundation: SQL Server (`mssql`) + SQL migrations, permission catalogue + seed, config-driven sidebar, server-side authz, CSRF/origin checks, audit log | ✅ |
| Requests: multi-item create/edit/draft/submit/cancel, record-level visibility | ✅ |
| Approvals: versioned, configurable workflows (manager / role stages, parallel stages, amount/type/department conditions), approve/reject/return, history | ✅ |
| IT review: spec confirmation, per-warehouse stock reservation (race-safe), procurement shortfall, partial fulfilment | ✅ |
| Assets: registration with tag generation, register, detail/lifecycle, assignment, employee acknowledgement, return with next status | ✅ |
| Inventory: stock by category × warehouse, consumable receipts/adjustments, reservations, movement history | ✅ |
| Notifications (in-app), dashboard, admin (roles from config, per-user role + permissions, workflows, master data, audit viewer) | ✅ |
| Procurement, Finance (Phase 4), Maintenance, email (Phase 5), Reports (Phase 6) | 🚧 placeholder pages |

## Getting started (local)

Requires Node 20.12+ and a SQL Server you can create a database on (for example SQL Server
Developer or Express, or the `mcr.microsoft.com/mssql/server` container).

```bash
cp .env.example .env.local      # set the DB_* values and SESSION_SECRET
npm install
npm run migrate                 # creates IT_Assest_manager if missing, applies database/migrations
npm run seed                    # syncs config/permissions.config.ts → permissions table
npm run seed:dev                # DEV ONLY: demo users, roles, workflow, stock
npm run dev
```

Sign in (dev mode) with an employee code:

| Code | Who | Try |
|---|---|---|
| `EMP001` | Aisha, employee | Create and submit a request; acknowledge the laptop |
| `EMP002` | Rahul, Aisha's manager | Approve it in **Approvals** |
| `EMP003` | Priya, IT admin | Open the request → IT review → reserve → *Issue to employee* |
| `EMP004` | Sam, super admin | User access, workflows, master data, audit logs |
| `ADMIN` | Administrator | Every permission |

## Scripts

| Command | Purpose |
|---|---|
| `npm run migrate` | Create the database if missing, then apply pending `database/migrations/*.sql` (each in its own transaction) |
| `npm run migrate:status` | List each migration as applied / pending / EDITED / missing |
| `npm run migrate:new add_x_col` | Create the next numbered file, e.g. `0009_add_x_col.sql` |
| `npm run seed` | Idempotent permission catalogue sync. Never assigns roles or grants permissions to users |
| `npm run seed:dev` | Demo data. Refuses unless `AUTH_MODE=dev` and not production |
| `npm run typecheck` / `npm test` / `npm run build` | Quality gates |

## Architecture

```
pages/            UI pages (getServerSideProps → withPageAuth) and pages/api/v1/* thin route handlers
components/       common/ (Button, FormField, DataTable, Modal, StatusBadge, …), layout/, requests/, assets/
config/           permissions.config.ts · sidebar.config.ts · status.config.ts · app.config.ts
server/
  middleware/     withApi (authn, permission, origin check, error mapping) · authorize
  services/       request · approval · inventory · asset · admin · dashboard · notification
                  workflow-rules / fulfilment-rules (pure, unit-tested)
  validators/     zod schemas
lib/              db (pool + query helpers), auth (integration point), session, api-response, client helpers
config/db-config.mjs  connection settings from DB_* env vars (shared by the app, migrations and seeds)
database/         migrations/NNNN_name.sql, seed.ts, dev/seed-dev.ts, create-app-login.sql
scripts/          migrate.mjs (migration runner)
```

Key rules this code enforces:

- **Server-side authorization everywhere.** Every API route declares a permission, and
  services add record-level checks: only the requester edits, only the assigned approver
  acts, only the assignee acknowledges. Hiding a UI button is never the only control.
- **Actor identity comes from the session**, never from the request body.
- **Multi-table operations run in transactions.** Stock and asset changes use
  conditional `UPDATE … WHERE` statements, backed by filtered unique indexes and CHECK
  constraints, so concurrent reservations cannot oversell.
- **Workflows are versioned.** Each request stores the version it used, and editing a
  workflow creates a new version.
- **History is preserved.** Assignments are closed rather than deleted, and the
  approval history and audit log are append-only.

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

Two logins: migrations use `DB_MIGRATE_USER` / `DB_MIGRATE_PASSWORD` when set; the app uses
`DB_USER`, which `database/create-app-login.sql` (run once by hand) limits to
`db_datareader` + `db_datawriter`.

`0001_users_and_permissions.sql` creates `users` **only if it doesn't exist**, so it never
recreates the organization's real table; on an existing table it only adds the `role` and
`permissions` columns. Read `docs/schema-mapping.md` before running it on a shared database.

## Design

Tokens from `DESIGN.md` live in `tailwind.config.ts`: fuchsia primary used only on
interactive elements, Poppins/Nunito/Space Mono, 12/16/24px radii, pill buttons and
layered shadows. Fonts load from Google Fonts; self-host them for air-gapped deployments.

## Known follow-ups

- Confirm the real `users`/auth/RBAC schema (see `docs/schema-mapping.md`).
- File uploads (request attachments, handover documents) need private storage.
- Delegation and escalation jobs, reservation-expiry release job, email notifications.
- `npm audit` flags advisories in transitive dev/build tooling (postcss inside next,
  and zod 3. The fixes need major upgrades (Next 16, Zod 4), so they are deferred for a
  deliberate upgrade.
- Integration and end-to-end tests against a real SQL Server (PRD §20).
