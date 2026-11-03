// npm run seed:dev  — LOCAL DEVELOPMENT ONLY.
//
// Creates demo users (only in a dev database), demo roles with explicit permission
// sets, master data, a default approval workflow and some stock so the
// request → approval → IT review → assignment → acknowledgement flow can be tried end to end.
// Refuses to run when NODE_ENV=production or AUTH_MODE is not "dev".
// Run `npm run seed` first to sync the permission catalogue.

import { prisma } from "../../lib/prisma";
import { loadAuthUser } from "../../lib/auth";
import { PERMISSION_KEYS, type PermissionKey } from "../../config/permissions.config";
import { registerAsset } from "../../server/services/asset.service";
import { recordManualMovement } from "../../server/services/inventory.service";
import { saveWorkflowVersion } from "../../server/services/admin.service";

if (process.env.NODE_ENV === "production" || process.env.AUTH_MODE !== "dev") {
  console.error("seed:dev only runs with AUTH_MODE=dev and NODE_ENV != production.");
  process.exit(1);
}

const ROLES: Record<string, { description: string; permissions: PermissionKey[] }> = {
  Employee: {
    description: "Every employee: create and track own requests and assets",
    permissions: ["dashboard.view", "request.create", "request.view", "asset.view"],
  },
  "Reporting Manager": {
    description: "Approves requests from direct reports",
    permissions: ["request.approve", "approve.button"],
  },
  "IT Admin": {
    description: "Reviews requests, manages stock and issues hardware",
    permissions: [
      "request.it_review",
      "request.view.all",
      "request.approve",
      "approve.button",
      "inventory.view",
      "inventory.manage",
      "asset.view.all",
      "asset.create",
      "asset.assign",
      "asset.return",
      "employee.view",
      "reports.view",
    ],
  },
  Auditor: {
    description: "Read-only access to records and audit history",
    permissions: ["dashboard.view", "request.view", "request.view.all", "inventory.view", "asset.view.all", "audit.view", "reports.view"],
  },
  "Super Admin": {
    description: "Application configuration, roles and workflows",
    permissions: ["admin.roles.manage", "admin.workflow.manage", "admin.master_data.manage", "audit.view", "employee.view"],
  },
  Administrator: {
    description: "Full access: every permission in the catalogue",
    // Derived from the config so newly added permission keys are granted on the next seed run.
    permissions: [...PERMISSION_KEYS],
  },
};

const USERS = [
  { employeeCode: "EMP001", fullName: "Aisha Khan", email: "aisha.khan@example.test", department: "Design", designation: "UX Designer", manager: "EMP002", roles: ["Employee"] },
  { employeeCode: "EMP002", fullName: "Rahul Mehta", email: "rahul.mehta@example.test", department: "Design", designation: "Design Manager", manager: null, roles: ["Employee", "Reporting Manager"] },
  { employeeCode: "EMP003", fullName: "Priya Nair", email: "priya.nair@example.test", department: "IT", designation: "IT Asset Manager", manager: null, roles: ["Employee", "IT Admin"] },
  { employeeCode: "EMP004", fullName: "Sam Fernandes", email: "sam.fernandes@example.test", department: "IT", designation: "Systems Administrator", manager: "EMP003", roles: ["Employee", "Super Admin", "Auditor"] },
  { employeeCode: "ADMIN", fullName: "Administrator", email: "admin@example.test", department: "IT", designation: "Application Administrator", manager: null, roles: ["Administrator"] },
];

async function upsertUsers() {
  const ids = new Map<string, number>();
  for (const u of USERS) {
    const existing = await prisma.user.findFirst({ where: { employeeCode: u.employeeCode }, select: { id: true } });
    const row = existing
      ? existing
      : await prisma.user.create({
          data: {
            employeeCode: u.employeeCode,
            fullName: u.fullName,
            email: u.email,
            department: u.department,
            designation: u.designation,
            isActive: true,
          },
          select: { id: true },
        });
    ids.set(u.employeeCode, row.id);
  }
  for (const u of USERS) {
    if (u.manager) await prisma.user.update({ where: { id: ids.get(u.employeeCode)! }, data: { managerId: ids.get(u.manager)! } });
  }
  return ids;
}

async function upsertRoles() {
  const roleIds = new Map<string, number>();
  for (const [roleName, def] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { roleName },
      update: { description: def.description },
      create: { roleName, description: def.description },
    });
    roleIds.set(roleName, role.id);
    const perms = await prisma.permission.findMany({ where: { permissionKey: { in: def.permissions } } });
    if (perms.length !== def.permissions.length) throw new Error("Run `npm run seed` first to sync the permission catalogue.");
    for (const p of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } },
        update: {},
        create: { roleId: role.id, permissionId: p.id },
      });
    }
  }
  return roleIds;
}

async function main() {
  const userIds = await upsertUsers();
  const roleIds = await upsertRoles();

  for (const u of USERS) {
    for (const r of u.roles) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: userIds.get(u.employeeCode)!, roleId: roleIds.get(r)! } },
        update: {},
        create: { userId: userIds.get(u.employeeCode)!, roleId: roleIds.get(r)! },
      });
    }
  }

  const categories = [
    { code: "LAPTOP", name: "Laptop", isSerialized: true },
    { code: "MONITOR", name: "Monitor", isSerialized: true },
    { code: "DOCK", name: "Docking station", isSerialized: true },
    { code: "KEYBOARD", name: "Keyboard", isSerialized: false },
    { code: "MOUSE", name: "Mouse", isSerialized: false },
  ];
  for (const c of categories) await prisma.hardwareCategory.upsert({ where: { code: c.code }, update: {}, create: c });

  const warehouses = [
    { code: "HQ-IT", name: "HQ IT Store", location: "Head office, Floor 2" },
    { code: "BR-IT", name: "Branch IT Store", location: "Branch office" },
  ];
  for (const w of warehouses) await prisma.warehouse.upsert({ where: { code: w.code }, update: {}, create: w });

  const admin = (await loadAuthUser(userIds.get("EMP003")!))!;
  const superAdmin = (await loadAuthUser(userIds.get("EMP004")!))!;

  if ((await prisma.approvalWorkflow.count()) === 0) {
    await saveWorkflowVersion(superAdmin, {
      workflowKey: "standard-hardware",
      name: "Standard hardware approval",
      requestType: null,
      department: null,
      minAmount: null,
      maxAmount: null,
      priority: 0,
      stages: [{ stageOrder: 1, name: "Reporting manager", approverType: "MANAGER", roleId: null, dueDays: 3 }],
    });
    await saveWorkflowVersion(superAdmin, {
      workflowKey: "high-value-hardware",
      name: "High-value hardware approval",
      requestType: null,
      department: null,
      minAmount: 200000,
      maxAmount: null,
      priority: 10,
      stages: [
        { stageOrder: 1, name: "Reporting manager", approverType: "MANAGER", roleId: null, dueDays: 3 },
        { stageOrder: 2, name: "IT head", approverType: "ROLE", roleId: roleIds.get("IT Admin")!, dueDays: 3 },
      ],
    });
  }

  if ((await prisma.asset.count()) === 0) {
    const cat = async (code: string) => (await prisma.hardwareCategory.findUniqueOrThrow({ where: { code } })).id;
    const wh = async (code: string) => (await prisma.warehouse.findUniqueOrThrow({ where: { code } })).id;
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
  .finally(() => prisma.$disconnect());
