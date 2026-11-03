// npm run seed
// Synchronizes the permission catalogue from config/permissions.config.ts.
// - Inserts missing keys, updates module/description, preserves IDs.
// - Never deletes permissions and never changes anyone's permissions.
// - Safe to run repeatedly.

import { loadEnvFiles } from "../config/db-config.mjs";
import { closeDb, execute, getPool, query } from "../lib/db";
import { permissions } from "../config/permissions.config";

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

  let inserted = 0;
  let updated = 0;
  for (const permission of permissions) {
    const row = existing.get(permission.key);
    if (!row) {
      await execute(pool, `INSERT INTO dbo.permissions (permission_key, module, description) VALUES (@key, @module, @description)`, {
        key: permission.key,
        module: permission.module,
        description: permission.description,
      });
      inserted++;
    } else if (row.module !== permission.module || row.description !== permission.description) {
      await execute(
        pool,
        `UPDATE dbo.permissions SET module = @module, description = @description, updated_at = SYSUTCDATETIME() WHERE id = @id`,
        { id: row.id, module: permission.module, description: permission.description }
      );
      updated++;
    }
  }

  const configured = new Set<string>(permissions.map((p) => p.key));
  const orphaned = Array.from(existing.keys()).filter((k) => !configured.has(k));

  console.log(`Permission catalogue synchronized: ${inserted} inserted, ${updated} updated, ${permissions.length} total.`);
  if (orphaned.length) {
    console.warn(`Keys in the database but not in config (left untouched, review manually): ${orphaned.join(", ")}`);
  }
}

main()
  .catch((error) => {
    console.error("Permission seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
