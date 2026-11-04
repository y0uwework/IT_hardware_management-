# Schema mapping: existing database ↔ HMS

PRD §2.1 and §22 require the real SQL Server schema to be inspected before the first
production migration. **That inspection has not happened yet**: this repository was
started without access to the organization's database. Everything marked
**ASSUMED** below must be confirmed and corrected before you run `npm run migrate`
against a shared or production database.

## 1. Existing `users` table (employee master, reused, never recreated)

| API field (`lib/auth.ts`, services) | Assumed column | Assumed type | Confirmed? |
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

1. Change the column names in the SQL that reads `dbo.users` (`lib/auth.ts`,
   `admin.service.ts`, `approval.service.ts`, and the `users` joins in the other services).
   If department or manager live in other tables, join those tables instead.
2. If `users.id` is not `INT` (for example `UNIQUEIDENTIFIER` or `BIGINT`), change
   **every** `*_user_id` column in `database/migrations/` to the same type (requester,
   approver, actor, user, issued_by, created_by, reviewed_by, recipient, returned_to,
   delegated_from). Once a migration has been applied, change types with a new migration.
3. Update the guarded `CREATE TABLE users` block in
   `database/migrations/0001_users_and_permissions.sql` so it matches. It only runs
   where `users` doesn't exist (local development).

## 2. Authentication (ASSUMED: none reusable yet)

`lib/auth.ts → verifyCredentials()` is the single integration point. Today:

- `AUTH_MODE=dev`: sign in by employee code only. Refused when `NODE_ENV=production`.
- `AUTH_MODE=external`: returns null until the existing SSO/session/password check is wired in.

Sessions are HMS's own HS256-signed, httpOnly, SameSite=Lax cookies that hold only the
`users.id`. Permissions are re-read from the database on every request. If the
organization already has a session cookie or SSO (OIDC/SAML/AD), replace
`getAuthUser()` to read it instead.

## 3. Roles and permissions

HMS creates only the `permissions` table. Roles are defined in code
(`config/roles.config.ts`), not in the database. Access is stored on `users` itself:

- `users.role` (NVARCHAR(50), nullable): a role key from the config, e.g. `IT_ADMIN`.
- `users.permissions` (NVARCHAR(max), JSON array of `permissions.id`, default `'[]'`):
  the permissions that actually authorize the user. Assigning a role copies that role's
  default permissions here; administrators can then adjust them per user.

**This means HMS adds two columns to the existing `users` table** (migration
`0001_users_and_permissions.sql`, guarded with `COL_LENGTH` checks). Confirm this is
acceptable for the organization's employee master before deploying to production.

## 4. Organizational masters (ASSUMED: none)

- **Departments:** stored as text on `users.department`; workflows match on that text.
- **Locations / warehouses:** HMS-owned `warehouses` table.
- **Cost centres:** free text on `hardware_requests.cost_centre` for now.

Swap these for FKs to existing master tables once they are identified.

## 5. Checklist before the first shared-database migration (PRD §11.4)

- [ ] Real `users` definition captured (`sp_help 'dbo.users'`) and this doc updated
- [ ] `users` column names in the SQL and every `*_user_id` type corrected
- [ ] Existing auth / RBAC / org tables identified and mapped
- [ ] `database/migrations/*.sql` reviewed against the real schema
- [ ] Migration applied to a **copy** of the database; existing logins still work
- [ ] Backup taken before production
