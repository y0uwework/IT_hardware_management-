// npm run seed
// Synchronizes the permission catalogue from config/permissions.config.ts.
// - Inserts missing keys, updates module/description, preserves IDs.
// - Never deletes permissions.
// - When a key is inserted for the first time, it is granted to existing users whose role
//   (config/roles.config.ts) includes it by default — e.g. adding item.* gives IT Admins and
//   Administrators access straight away. Permissions that already existed are never granted
//   or revoked, so per-user adjustments made by an administrator are preserved.
// - Safe to run repeatedly.

import { loadEnvFiles } from "../config/db-config.mjs";
import { closeDb, execute, getPool, query, queryOne } from "../lib/db";
import { parsePermissionIds, serializePermissionIds } from "../lib/auth";
import { permissions } from "../config/permissions.config";
import { isRoleKey, roles } from "../config/roles.config";

loadEnvFiles();

async function main() {
  const pool = await getPool();
  const existing = new Map(
    (
      await query<{ id: number; permissionKey: string; module: string; description: string }>(
        pool,
        `SELECT id, permission_key AS permissionKey, module, description FROM dbo.permissions`
      )
    ).map((p) => [p.permissionKey, p])
  );

  const newlyInserted = new Map<string, number>(); // key → id
  let updated = 0;
  for (const permission of permissions) {
    const row = existing.get(permission.key);
    if (!row) {
      const insertedRow = await queryOne<{ id: number }>(
        pool,
        `INSERT INTO dbo.permissions (permission_key, module, description) OUTPUT INSERTED.id VALUES (@key, @module, @description)`,
        { key: permission.key, module: permission.module, description: permission.description }
      );
      newlyInserted.set(permission.key, insertedRow!.id);
    } else if (row.module !== permission.module || row.description !== permission.description) {
      await execute(
        pool,
        `UPDATE dbo.permissions SET module = @module, description = @description, updated_at = SYSUTCDATETIME() WHERE id = @id`,
        { id: row.id, module: permission.module, description: permission.description }
      );
      updated++;
    }
  }

  const granted = await grantNewPermissionsByRole(newlyInserted);

  const configured = new Set<string>(permissions.map((p) => p.key));
  const orphaned = Array.from(existing.keys()).filter((k) => !configured.has(k));

  console.log(`Permission catalogue synchronized: ${newlyInserted.size} inserted, ${updated} updated, ${permissions.length} total.`);
  if (granted) console.log(`Granted new permissions to ${granted} user(s) based on their role defaults.`);
  if (orphaned.length) {
    console.warn(`Keys in the database but not in config (left untouched, review manually): ${orphaned.join(", ")}`);
  }
}

/** Add each newly inserted permission to users whose role lists it in defaultPermissions. */
async function grantNewPermissionsByRole(newlyInserted: Map<string, number>) {
  if (newlyInserted.size === 0) return 0;
  const pool = await getPool();
  const users = await query<{ id: number; role: string | null; permissions: string | null }>(
    pool,
    `SELECT id, role, permissions FROM dbo.users WHERE role IS NOT NULL`
  );
  let changed = 0;
  for (const user of users) {
    if (!isRoleKey(user.role)) continue;
    const defaults = new Set<string>(roles[user.role].defaultPermissions);
    const add = Array.from(newlyInserted).filter(([key]) => defaults.has(key)).map(([, id]) => id);
    if (add.length === 0) continue;
    const current = parsePermissionIds(user.permissions);
    await execute(pool, `UPDATE dbo.users SET permissions = @permissions WHERE id = @id`, {
      id: user.id,
      permissions: serializePermissionIds([...current, ...add]),
    });
    changed++;
  }
  return changed;
}

main()
  .catch((error) => {
    console.error("Permission seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
