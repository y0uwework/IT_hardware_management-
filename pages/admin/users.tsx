import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Checkbox } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { DataTable, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { Alert } from "@/components/common/States";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { api, ApiClientError, qs, useApi } from "@/lib/client";

export const getServerSideProps = withPageAuth("admin.roles.manage");

interface Row {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string | null;
  department: string | null;
  designation: string | null;
  isActive: boolean;
  role: string | null;
  roleName: string | null;
  /** permission IDs */
  permissions: number[];
}
interface RoleDef {
  key: string;
  name: string;
}
interface Permission {
  id: number;
  permissionKey: string;
  module: string;
  description: string;
}

export default function UsersAccessPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const search = typeof router.query.search === "string" ? router.query.search : "";
  const page = Number(router.query.page ?? 1) || 1;
  const setQuery = (patch: Record<string, string | number | undefined>) =>
    void router.replace({ query: { ...router.query, page: 1, ...patch } }, undefined, { shallow: true });

  const roles = useApi<RoleDef[]>(forbidden ? null : "/admin/roles");
  const perms = useApi<Permission[]>(forbidden ? null : "/admin/permissions");
  const { data, meta, error, loading, reload } = useApi<Row[]>(router.isReady && !forbidden ? `/users${qs({ search, page })}` : null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const [editing, setEditing] = useState<Row | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const byModule = useMemo(() => {
    const m = new Map<string, Permission[]>();
    for (const p of perms.data ?? []) m.set(p.module, [...(m.get(p.module) ?? []), p]);
    return Array.from(m.entries());
  }, [perms.data]);

  const fail = (e: unknown, fallback: string) => setMsg({ tone: "error", text: e instanceof ApiClientError ? e.message : fallback });

  async function changeRole(u: Row, role: string) {
    setMsg(null);
    try {
      await api(`/admin/users/${u.id}/role`, { method: "PUT", body: { role: role || null, applyDefaults: true } });
      setMsg({ tone: "success", text: `${u.fullName}: role updated and default permissions applied.` });
      await reload();
    } catch (e) {
      fail(e, "Could not update role");
    }
  }

  function openPermissions(u: Row) {
    setEditing(u);
    setChecked(new Set(u.permissions));
  }

  async function savePermissions() {
    if (!editing || !perms.data) return;
    setSaving(true);
    setMsg(null);
    try {
      const keys = perms.data.filter((p) => checked.has(p.id)).map((p) => p.permissionKey);
      await api(`/admin/users/${editing.id}/permissions`, { method: "PUT", body: { permissions: keys } });
      setMsg({ tone: "success", text: `${editing.fullName}: permissions saved. They apply on the user's next page load.` });
      setEditing(null);
      await reload();
    } catch (e) {
      fail(e, "Could not save permissions");
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: number, on: boolean) {
    setChecked((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  const columns: Column<Row>[] = [
    {
      key: "user",
      header: "Employee",
      render: (u) => (
        <span>
          <span className="block font-semibold text-neutral-900">
            {u.fullName} {!u.isActive && <span className="text-caption font-normal text-error">(inactive)</span>}
          </span>
          <span className="block text-neutral-500">
            {u.employeeCode}
            {u.department ? ` · ${u.department}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (u) => (
        <select
          aria-label={`Role for ${u.fullName}`}
          value={u.role ?? ""}
          onChange={(e) => changeRole(u, e.target.value)}
          className="h-[34px] rounded-md border-[1.5px] border-neutral-300 bg-white px-3 text-body-sm hover:border-primary focus:border-primary focus:outline-none"
        >
          <option value="">No role</option>
          {u.role && !u.roleName && <option value={u.role}>{u.role} (not in config)</option>}
          {(roles.data ?? []).map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "permissions",
      header: "Permissions",
      render: (u) => (
        <Button variant="ghost" size="sm" onClick={() => openPermissions(u)} disabled={!perms.data}>
          {u.permissions.length} permission(s) · Edit
        </Button>
      ),
    },
  ];

  return (
    <MainLayout user={user} title="Users & access" forbidden={forbidden}>
      <PageHeader
        title="Users & access"
        subtitle="Choosing a role applies its default permissions. Use Edit to fine-tune an individual user's permissions."
      />
      {msg && (
        <div className="mb-6">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      )}
      <Card padded={false}>
        <div className="flex justify-end border-b border-neutral-200 p-4 sm:p-6">
          <SearchInput value={search} onChange={(v) => setQuery({ search: v || undefined })} placeholder="Name, code or email" />
        </div>
        <DataTable columns={columns} rows={data} rowKey={(u) => u.id} loading={loading} error={error} onRetry={reload} emptyTitle="No users found" />
        <Pagination meta={meta} onPage={(p) => setQuery({ page: p })} />
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing ? `Permissions · ${editing.fullName}` : "Permissions"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={savePermissions} loading={saving}>
              Save permissions
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          {byModule.map(([module, list]) => (
            <fieldset key={module}>
              <legend className="eyebrow mb-3">{module}</legend>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {list.map((p) => (
                  <Checkbox
                    key={p.id}
                    label={p.permissionKey}
                    description={p.description}
                    checked={checked.has(p.id)}
                    onChange={(on) => toggle(p.id, on)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </Modal>
    </MainLayout>
  );
}
