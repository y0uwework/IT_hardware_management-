// npm run seed
// Synchronizes the permission catalogue from config/permissions.config.ts.
// - Inserts missing keys, updates module/description, preserves IDs.
// - Never deletes permissions or role assignments, never grants permissions to roles.
// - Safe to run repeatedly.

import { PrismaClient } from "@prisma/client";
import { permissions } from "../config/permissions.config";

const prisma = new PrismaClient();

async function main() {
  let inserted = 0;
  let updated = 0;

  for (const permission of permissions) {
    const existing = await prisma.permission.findUnique({ where: { permissionKey: permission.key } });
    if (!existing) {
      await prisma.permission.create({
        data: { permissionKey: permission.key, module: permission.module, description: permission.description },
      });
      inserted++;
    } else if (existing.module !== permission.module || existing.description !== permission.description) {
      await prisma.permission.update({
        where: { id: existing.id },
        data: { module: permission.module, description: permission.description },
      });
      updated++;
    }
  }

  const configured = new Set<string>(permissions.map((p) => p.key));
  const orphaned = (await prisma.permission.findMany({ select: { permissionKey: true } }))
    .map((p) => p.permissionKey)
    .filter((k) => !configured.has(k));

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
  .finally(async () => {
    await prisma.$disconnect();
  });
