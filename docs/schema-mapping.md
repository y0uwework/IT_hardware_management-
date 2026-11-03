# Schema mapping: existing database ↔ HMS

PRD §2.1 and §22 require the real SQL Server schema to be inspected before the first
production migration. **That inspection has not happened yet**: this repository was
started without access to the organization's database. Everything marked
**ASSUMED** below must be confirmed and corrected before you run `npm run migrate`
against a shared or production database.

## 1. Existing `users` table (employee master, reused, never recreated)

| HMS field (`prisma/schema.prisma` → `User`) | Assumed column | Assumed type | Confirmed? |
|---|---|---|---|
| `id` | `id` | `INT IDENTITY(1,1)` PK | ☐ ASSUMED |
| `employeeCode` | `employee_code` | `NVARCHAR(50)` | ☐ ASSUMED |
| `fullName` | `full_name` | `NVARCHAR(200)` | ☐ ASSUMED |
| `email` | `email` | `NVARCHAR(255) NULL` | ☐ ASSUMED |
| `department` | `department` | `NVARCHAR(100) NULL` (text, not FK) | ☐ ASSUMED |
| `designation` | `designation` | `NVARCHAR(100) NULL` | ☐ ASSUMED |
| `location` | `location` | `NVARCHAR(100) NULL` | ☐ ASSUMED |
| `managerId` | `manager_id` | `INT NULL` → `users.id` | ☐ ASSUMED |
| `isActive` | `is_active` | `BIT` | ☐ ASSUMED |

**If the real table differs:**

1. Change the `User` model's `@map(...)` names and `@db.*` types to match. If
   department or manager live in other tables, model those tables and adjust
   `lib/auth.ts`, `approval.service.ts` (manager resolution) and `dashboard.service.ts`.
2. If `users.id` is not `INT` (for example `UNIQUEIDENTIFIER` or `BIGINT`), change
   **every** `*UserId` field in `schema.prisma` to the same type. These are
   `requesterUserId`, `approverUserId`, `actorUserId`, `userId`, `issuedByUserId`,
   `createdByUserId`, `assignedByUserId`, `reviewedByUserId`, `recipientUserId`,
   `returnedToUserId` and `delegatedFromUserId`. Then regenerate the baseline migration.
3. Update the guarded `CREATE TABLE users` block in
   `prisma/migrations/20261102000000_init_hms/migration.sql` so it matches. It only
   runs where `users` doesn't exist (local dev and Prisma's shadow DB).

## 2. Authentication (ASSUMED: none reusable yet)

`lib/auth.ts → verifyCredentials()` is the single integration point. Today:

- `AUTH_MODE=dev`: sign in by employee code only. Refused when `NODE_ENV=production`.
- `AUTH_MODE=external`: returns null until the existing SSO/session/password check is wired in.

Sessions are HMS's own HS256-signed, httpOnly, SameSite=Lax cookies that hold only the
`users.id`. Permissions are re-read from the database on every request. If the
organization already has a session cookie or SSO (OIDC/SAML/AD), replace
`getAuthUser()` to read it instead.

## 3. Existing RBAC tables (ASSUMED: none)

HMS creates `permissions`, `roles`, `user_roles` and `role_permissions`. If equivalents
already exist, map these Prisma models onto them with `@@map`/`@map` instead of
creating new tables, and delete those `CREATE TABLE` statements from the baseline migration.

## 4. Organizational masters (ASSUMED: none)

- **Departments:** stored as text on `users.department`; workflows match on that text.
- **Locations / warehouses:** HMS-owned `warehouses` table.
- **Cost centres:** free text on `hardware_requests.cost_centre` for now.

Swap these for FKs to existing master tables once they are identified.

## 5. Checklist before the first shared-database migration (PRD §11.4)

- [ ] Real `users` definition captured (`sp_help 'dbo.users'`) and this doc updated
- [ ] `User` model and every `*UserId` type corrected
- [ ] Existing auth / RBAC / org tables identified and mapped
- [ ] `prisma migrate diff` re-run and the baseline SQL reviewed
- [ ] Migration applied to a **copy** of the database; existing logins still work
- [ ] Backup taken before production
