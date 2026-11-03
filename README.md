# Hardware Management System (HMS)

Next.js (Pages Router) + TypeScript + Tailwind + Prisma on Microsoft SQL Server.
It manages hardware from an employee's request through approval, IT stock check,
reservation, assignment, acknowledgement and return. See `PRD.md` for the full
blueprint and `DESIGN.md` for the visual system.

> ⚠️ Read `docs/schema-mapping.md` before pointing this at a real database. The
> existing `users` table structure is **assumed** and must be confirmed.

## What's built (Phase 1 + first vertical slice)

| Area | Status |
|---|---|
| Foundation: Prisma/SQL Server, migration, permission catalogue + seed, config-driven sidebar, server-side authz, CSRF/origin checks, audit log | ✅ |
| Requests: multi-item create/edit/draft/submit/cancel, record-level visibility | ✅ |
| Approvals: versioned, configurable workflows (manager / role stages, parallel stages, amount/type/department conditions), approve/reject/return, history | ✅ |
| IT review: spec confirmation, per-warehouse stock reservation (race-safe), procurement shortfall, partial fulfilment | ✅ |
| Assets: registration with tag generation, register, detail/lifecycle, assignment, employee acknowledgement, return with next status | ✅ |
| Inventory: stock by category × warehouse, consumable receipts/adjustments, reservations, movement history | ✅ |
| Notifications (in-app), dashboard, admin (roles ↔ permissions, user roles, workflows, master data, audit viewer) | ✅ |
| Procurement, Finance (Phase 4), Maintenance, email (Phase 5), Reports (Phase 6) | 🚧 placeholder pages |

## Getting started (local)

Requires Node 20+ and a SQL Server you can create a database on (for example SQL Server
Developer or Express, or the `mcr.microsoft.com/mssql/server` container).

```bash
cp .env.example .env            # set DATABASE_URL and SESSION_SECRET
npm install
npm run migrate                 # applies prisma/migrations (prisma migrate deploy)
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
| `EMP004` | Sam, super admin | Roles & permissions, workflows, master data, audit logs |

## Scripts

| Command | Purpose |
|---|---|
| `npm run migrate` | Apply committed migrations (production-safe `prisma migrate deploy`) |
| `npm run migrate:dev -- --name x` | Create a new migration during development |
| `npm run seed` | Idempotent permission catalogue sync. Never grants permissions to roles |
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
lib/              prisma, auth (integration point), session, api-response, client helpers
prisma/           schema.prisma, migrations/, seed.ts, dev/seed-dev.ts
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

## Migrations and the existing `users` table

The baseline migration creates `users` **only if it doesn't exist**, so it never touches
the organization's real table. The guard keeps local development and Prisma's
shadow database consistent. Read `docs/schema-mapping.md` before running it on a
shared database.

## Design

Tokens from `DESIGN.md` live in `tailwind.config.ts`: fuchsia primary used only on
interactive elements, Poppins/Nunito/Space Mono, 12/16/24px radii, pill buttons and
layered shadows. Fonts load from Google Fonts; self-host them for air-gapped deployments.

## Known follow-ups

- Confirm the real `users`/auth/RBAC schema (see `docs/schema-mapping.md`).
- File uploads (request attachments, handover documents) need private storage.
- Delegation and escalation jobs, reservation-expiry release job, email notifications.
- `npm audit` flags advisories in transitive dev/build tooling (postcss inside next,
  deepmerge-ts inside prisma) and zod 3. The fixes need major upgrades (Next 16,
  Prisma 7, Zod 4), so they are deferred for a deliberate upgrade.
- Integration and end-to-end tests against a real SQL Server (PRD §20).
