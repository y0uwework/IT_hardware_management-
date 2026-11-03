import { describe, expect, it } from "vitest";
import { filterSidebar, hasPermission } from "../../shared/permissions";
import { sidebarConfig } from "../../shared/config/sidebar.config";
import { PERMISSION_KEYS, permissions } from "../../shared/config/permissions.config";
import { ASSET_TRANSITIONS, REQUEST_STATUS, REQUEST_TRANSITIONS, canTransition } from "../../shared/config/status.config";

describe("permission catalogue", () => {
  it("has unique keys", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(permissions.length);
  });
  it("every sidebar entry references a catalogue key", () => {
    const keys = (p: string | readonly string[]) => (Array.isArray(p) ? p : [p]);
    for (const item of sidebarConfig) {
      for (const k of keys(item.permission)) expect(PERMISSION_KEYS).toContain(k);
      for (const c of item.children ?? []) for (const k of keys(c.permission)) expect(PERMISSION_KEYS).toContain(k);
    }
  });
});

describe("hasPermission / filterSidebar", () => {
  const employee = { permissions: ["dashboard.view", "request.view", "request.create", "asset.view"] };

  it("checks membership", () => {
    expect(hasPermission(employee, "request.create")).toBe(true);
    expect(hasPermission(employee, "request.approve")).toBe(false);
    expect(hasPermission(null, "dashboard.view")).toBe(false);
  });

  it("shows only authorized entries", () => {
    const labels = filterSidebar(sidebarConfig, employee).map((i) => i.label);
    expect(labels).toEqual(["Dashboard", "Asset Requests"]);
  });

  it("shows the item master only with item.view", () => {
    const labels = (permissions: string[]) => filterSidebar(sidebarConfig, { permissions }).map((i) => i.label);
    expect(labels(["item.view"])).toContain("Item Master");
    expect(labels(["item.create"])).not.toContain("Item Master");
  });

  it("filters children independently", () => {
    const admin = { permissions: ["admin.roles.manage"] };
    const adminItem = filterSidebar(sidebarConfig, admin).find((i) => i.label === "Administration")!;
    expect(adminItem.children?.map((c) => c.label)).toEqual(["Roles", "Users & Access"]);
  });
});

describe("status transitions", () => {
  it("allows the happy path", () => {
    const path = [
      REQUEST_STATUS.DRAFT,
      REQUEST_STATUS.PENDING_APPROVAL,
      REQUEST_STATUS.APPROVED,
      REQUEST_STATUS.UNDER_IT_REVIEW,
      REQUEST_STATUS.PARTIALLY_FULFILLED,
      REQUEST_STATUS.FULFILLED,
    ];
    for (let i = 1; i < path.length; i++) expect(canTransition(REQUEST_TRANSITIONS, path[i - 1], path[i])).toBe(true);
  });
  it("blocks terminal and skipping transitions", () => {
    expect(canTransition(REQUEST_TRANSITIONS, REQUEST_STATUS.REJECTED, REQUEST_STATUS.APPROVED)).toBe(false);
    expect(canTransition(REQUEST_TRANSITIONS, REQUEST_STATUS.DRAFT, REQUEST_STATUS.APPROVED)).toBe(false);
    expect(canTransition(REQUEST_TRANSITIONS, REQUEST_STATUS.FULFILLED, REQUEST_STATUS.CANCELLED)).toBe(false);
  });
  it("does not let a disposed asset come back", () => {
    expect(canTransition(ASSET_TRANSITIONS, "Disposed", "Available")).toBe(false);
  });
});
