// npm run seed:dev  — LOCAL DEVELOPMENT ONLY.
//
// Creates demo users (only in a dev database) with a role from shared/config/roles.config.ts
// and that role's default permissions (stored as permission IDs on the user), master data, a default approval workflow and some stock so the
// request → approval → IT review → assignment → acknowledgement flow can be tried end to end.
// Refuses to run when NODE_ENV=production or AUTH_MODE is not "dev".
// Run `npm run seed` first to sync the permission catalogue.

import { loadEnvFiles } from "../../shared/config/db-config.mjs";
import { closeDb, execute, getPool, query, queryOne } from "../../shared/db";
import { loadAuthUser, serializePermissionIds } from "../../shared/auth";
import { roles, type RoleKey } from "../../shared/config/roles.config";
import { registerAsset } from "../../modules/assets/assets.service";
import { recordManualMovement } from "../../modules/inventory/inventory.service";
import { saveWorkflowVersion } from "../../modules/admin/admin.service";

loadEnvFiles();

if (process.env.NODE_ENV === "production" || process.env.AUTH_MODE !== "dev") {
  console.error("seed:dev only runs with AUTH_MODE=dev and NODE_ENV != production.");
  process.exit(1);
}

const USERS: {
  employeeCode: string;
  fullName: string;
  email: string;
  department: string;
  designation: string;
  manager: string | null;
  role: RoleKey;
}[] = [
  { employeeCode: "EMP001", fullName: "Aisha Khan", email: "aisha.khan@example.test", department: "Design", designation: "UX Designer", manager: "EMP002", role: "EMPLOYEE" },
  { employeeCode: "EMP002", fullName: "Rahul Mehta", email: "rahul.mehta@example.test", department: "Design", designation: "Design Manager", manager: null, role: "REPORTING_MANAGER" },
  { employeeCode: "EMP003", fullName: "Priya Nair", email: "priya.nair@example.test", department: "IT", designation: "IT Asset Manager", manager: null, role: "IT_ADMIN" },
  { employeeCode: "EMP004", fullName: "Sam Fernandes", email: "sam.fernandes@example.test", department: "IT", designation: "Systems Administrator", manager: "EMP003", role: "SUPER_ADMIN" },
  { employeeCode: "ADMIN", fullName: "Administrator", email: "admin@example.test", department: "IT", designation: "Application Administrator", manager: null, role: "ADMINISTRATOR" },
];

async function upsertUsers() {
  const pool = await getPool();
  const ids = new Map<string, number>();
  for (const u of USERS) {
    const existing = await queryOne<{ id: number }>(pool, `SELECT TOP 1 id FROM dbo.users WHERE employee_code = @code ORDER BY id`, {
      code: u.employeeCode,
    });
    const row =
      existing ??
      (await queryOne<{ id: number }>(
        pool,
        `INSERT INTO dbo.users (employee_code, full_name, email, department, designation, is_active)
         OUTPUT INSERTED.id
         VALUES (@employeeCode, @fullName, @email, @department, @designation, 1)`,
        { employeeCode: u.employeeCode, fullName: u.fullName, email: u.email, department: u.department, designation: u.designation }
      ))!;
    ids.set(u.employeeCode, row.id);
  }
  for (const u of USERS) {
    if (u.manager) {
      await execute(pool, `UPDATE dbo.users SET manager_id = @managerId WHERE id = @id`, {
        id: ids.get(u.employeeCode)!,
        managerId: ids.get(u.manager)!,
      });
    }
  }
  return ids;
}

/** Default permission IDs for a role, resolved against the synced permission catalogue. */
async function defaultPermissionIds(role: RoleKey) {
  const keys = [...(roles[role].defaultPermissions as readonly string[])];
  if (keys.length === 0) return [];
  const perms = await query<{ id: number }>(await getPool(), `SELECT id FROM dbo.permissions WHERE permission_key IN (@keys)`, { keys });
  if (perms.length !== keys.length) throw new Error("Run `npm run seed` first to sync the permission catalogue.");
  return perms.map((p) => p.id);
}

/** Give each demo user their role + default permissions. Users that already have a role are left alone. */
async function assignRoles(ids: Map<string, number>) {
  const pool = await getPool();
  for (const u of USERS) {
    const id = ids.get(u.employeeCode)!;
    const current = await queryOne<{ role: string | null }>(pool, `SELECT role FROM dbo.users WHERE id = @id`, { id });
    if (current?.role) continue;
    await execute(pool, `UPDATE dbo.users SET role = @role, permissions = @permissions WHERE id = @id`, {
      id,
      role: u.role,
      permissions: serializePermissionIds(await defaultPermissionIds(u.role)),
    });
  }
}

async function main() {
  const pool = await getPool();
  const userIds = await upsertUsers();
  await assignRoles(userIds);

  const categories = [
    { code: "LAPTOP", name: "Laptop", isSerialized: true },
    { code: "MONITOR", name: "Monitor", isSerialized: true },
    { code: "DOCK", name: "Docking station", isSerialized: true },
    { code: "KEYBOARD", name: "Keyboard", isSerialized: false },
    { code: "MOUSE", name: "Mouse", isSerialized: false },
  ];
  for (const c of categories) {
    await execute(
      pool,
      `IF NOT EXISTS (SELECT 1 FROM dbo.hardware_categories WHERE code = @code)
         INSERT INTO dbo.hardware_categories (code, name, is_serialized) VALUES (@code, @name, @isSerialized)`,
      c
    );
  }

  const warehouses = [
    { code: "HQ-IT", name: "HQ IT Store", location: "Head office, Floor 2" },
    { code: "BR-IT", name: "Branch IT Store", location: "Branch office" },
  ];
  for (const w of warehouses) {
    await execute(
      pool,
      `IF NOT EXISTS (SELECT 1 FROM dbo.warehouses WHERE code = @code)
         INSERT INTO dbo.warehouses (code, name, location) VALUES (@code, @name, @location)`,
      w
    );
  }

  const items = [
    { code: "LAP-DL5440", name: "Dell Latitude 5440 14in", category: "LAPTOP", itemType: "Hardware", manufacturer: "Dell", model: "Latitude 5440", uom: "Nos", cost: 72000, description: "Intel i5, 16GB RAM, 512GB SSD, 14-inch FHD, Windows 11 Pro" },
    { code: "LAP-MBA13", name: "Apple MacBook Air 13in M3", category: "LAPTOP", itemType: "Hardware", manufacturer: "Apple", model: "MacBook Air M3", uom: "Nos", cost: 115000, description: "M3, 16GB RAM, 512GB SSD, 13.6-inch" },
    { code: "MON-P2423", name: "Dell P2423 24in Monitor", category: "MONITOR", itemType: "Hardware", manufacturer: "Dell", model: "P2423", uom: "Nos", cost: 16500, description: "24-inch IPS, 1920x1200, HDMI/DP/USB" },
    { code: "DOCK-WD19", name: "Dell WD19S USB-C Dock", category: "DOCK", itemType: "Accessory", manufacturer: "Dell", model: "WD19S", uom: "Nos", cost: 14000, description: "USB-C dock, 130W, dual display" },
    { code: "KB-MK270", name: "Logitech MK270 Keyboard + Mouse", category: "KEYBOARD", itemType: "Accessory", manufacturer: "Logitech", model: "MK270", uom: "Set", cost: 1800, description: "Wireless keyboard and mouse combo" },
    { code: "MS-M90", name: "Logitech M90 Wired Mouse", category: "MOUSE", itemType: "Accessory", manufacturer: "Logitech", model: "M90", uom: "Nos", cost: 350, description: "USB wired optical mouse" },
  ];
  const seedUserId = userIds.get("EMP004")!;
  for (const it of items) {
    await execute(
      pool,
      `IF NOT EXISTS (SELECT 1 FROM dbo.item_master WHERE item_code = @code AND is_deleted = 0)
         INSERT INTO dbo.item_master
           (item_code, item_name, category_id, item_type, manufacturer, model, unit_of_measure, standard_cost, description, created_by_user_id)
         SELECT @code, @name, c.id, @itemType, @manufacturer, @model, @uom, @cost, @description, @createdBy
         FROM dbo.hardware_categories c WHERE c.code = @category`,
      { ...it, createdBy: seedUserId }
    );
  }

  const admin = (await loadAuthUser(userIds.get("EMP003")!))!;
  const superAdmin = (await loadAuthUser(userIds.get("EMP004")!))!;

  const count = async (table: string) => (await queryOne<{ n: number }>(pool, `SELECT COUNT(*) AS n FROM dbo.${table}`))!.n;

  if ((await count("approval_workflows")) === 0) {
    await saveWorkflowVersion(superAdmin, {
      workflowKey: "standard-hardware",
      name: "Standard asset approval",
      requestType: null,
      department: null,
      minAmount: null,
      maxAmount: null,
      priority: 0,
      stages: [{ stageOrder: 1, name: "Reporting manager", approverType: "MANAGER", roleKey: null, dueDays: 3 }],
    });
    await saveWorkflowVersion(superAdmin, {
      workflowKey: "high-value-hardware",
      name: "High-value asset approval",
      requestType: null,
      department: null,
      minAmount: 200000,
      maxAmount: null,
      priority: 10,
      stages: [
        { stageOrder: 1, name: "Reporting manager", approverType: "MANAGER", roleKey: null, dueDays: 3 },
        { stageOrder: 2, name: "IT head", approverType: "ROLE", roleKey: "IT_ADMIN", dueDays: 3 },
      ],
    });
  }

  if ((await count("assets")) === 0) {
    const idByCode = async (table: string, code: string) =>
      (await queryOne<{ id: number }>(pool, `SELECT id FROM dbo.${table} WHERE code = @code`, { code }))!.id;
    const cat = (code: string) => idByCode("hardware_categories", code);
    const wh = (code: string) => idByCode("warehouses", code);
    const hq = await wh("HQ-IT");
    const br = await wh("BR-IT");
    const laptop = await cat("LAPTOP");
    const monitor = await cat("MONITOR");
    const year = new Date().getFullYear();

    const laptops = [
      ["Dell", "Latitude 7450", "DL7450-A1", hq],
      ["Dell", "Latitude 7450", "DL7450-A2", hq],
      ["Lenovo", "ThinkPad T14 Gen 5", "LNT14-B7", hq],
      ["Apple", "MacBook Pro 14", "MBP14-C3", br],
    ] as const;
    for (const [manufacturer, model, serial, warehouseId] of laptops) {
      await registerAsset(admin, {
        categoryId: laptop,
        warehouseId,
        manufacturer,
        model,
        serialNumber: serial,
        specification: "16GB RAM, 512GB SSD",
        purchaseDate: `${year}-01-15`,
        purchaseCost: 145000,
        warrantyEndDate: `${year + 3}-01-14`,
        condition: "New",
        notes: null,
      });
    }
    for (const serial of ["U2724-01", "U2724-02"]) {
      await registerAsset(admin, {
        categoryId: monitor,
        warehouseId: hq,
        manufacturer: "Dell",
        model: "UltraSharp U2724D",
        serialNumber: serial,
        specification: '27" QHD',
        purchaseDate: `${year}-02-01`,
        purchaseCost: 32000,
        warrantyEndDate: `${year + 3}-01-31`,
        condition: "New",
        notes: null,
      });
    }
    await recordManualMovement(admin, { categoryId: await cat("KEYBOARD"), warehouseId: hq, movementType: "Receipt", quantity: 25, reason: "Opening stock" });
    await recordManualMovement(admin, { categoryId: await cat("MOUSE"), warehouseId: hq, movementType: "Receipt", quantity: 2, reason: "Opening stock" });
  }

  console.log("Dev data ready. Sign in with EMP001 (employee), EMP002 (manager), EMP003 (IT admin), EMP004 (super admin) or ADMIN (all permissions).");
}

main()
  .catch((e) => {
    console.error("seed:dev failed:", e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
