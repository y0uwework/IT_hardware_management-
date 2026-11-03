import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Checkbox, Input, Textarea } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { Alert, ErrorState } from "@/components/common/States";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { api, ApiClientError, useApi } from "@/lib/client";

export const getServerSideProps = withPageAuth("admin.roles.manage");

interface Role {
  id: number;
  roleName: string;
  description: string | null;
  isActive: boolean;
  rolePermissions: { permission: { permissionKey: string } }[];
  _count: { userRoles: number };
}
interface Permission {
  id: number;
  permissionKey: string;
  module: string;
  description: string;
}

export default function RolesPage({ user, forbidden }: ProtectedPageProps) {
  const roles = useApi<Role[]>(forbidden ? null : "/admin/roles");
  const perms = useApi<Permission[]>(forbidden ? null : "/admin/permissions");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ roleName: "", description: "" });

  const selected = roles.data?.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && roles.data?.length) setSelectedId(roles.data[0].id);
  }, [roles.data, selectedId]);

  useEffect(() => {
    setChecked(new Set(selected?.rolePermissions.map((rp) => rp.permission.permissionKey) ?? []));
    setMsg(null);
  }, [selected]);

  const byModule = useMemo(() => {
    const m = new Map<string, Permission[]>();
    for (const p of perms.data ?? []) m.set(p.module, [...(m.get(p.module) ?? []), p]);
    return Array.from(m.entries());
  }, [perms.data]);

  const original = new Set(selected?.rolePermissions.map((rp) => rp.permission.permissionKey) ?? []);
  const dirty = checked.size !== original.size || Array.from(checked).some((k) => !original.has(k));

  function toggle(key: string, on: boolean) {
    setChecked((s) => {
      const n = new Set(s);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setMsg(null);
    try {
      await api(`/admin/roles/${selected.id}/permissions`, { method: "PUT", body: { permissions: Array.from(checked) } });
      setMsg({ tone: "success", text: "Permissions saved. Users get the change on their next page load." });
      await roles.reload();
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiClientError ? e.message : "Could not save" });
    } finally {
      setSaving(false);
    }
  }

  async function createRole() {
    setSaving(true);
    try {
      const r = await api<Role>("/admin/roles", { method: "POST", body: { roleName: newRole.roleName, description: newRole.description || null } });
      setCreateOpen(false);
      setNewRole({ roleName: "", description: "" });
      await roles.reload();
      setSelectedId(r.data.id);
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiClientError ? e.message : "Could not create role" });
      setCreateOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!selected) return;
    await api(`/admin/roles/${selected.id}`, { method: "PUT", body: { isActive: !selected.isActive } }).catch((e) =>
      setMsg({ tone: "error", text: e.message })
    );
    await roles.reload();
  }

  return (
    <MainLayout user={user} title="Roles & permissions" forbidden={forbidden}>
      <PageHeader
        title="Roles & permissions"
        subtitle="Permission keys come from config/permissions.config.ts. Choose which roles hold them."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={18} aria-hidden="true" /> New role
          </Button>
        }
      />
      {(roles.loading || perms.loading) && !roles.data && <LoadingState />}
      {(roles.error || perms.error) && <ErrorState message={roles.error ?? perms.error!} onRetry={roles.reload} />}
      {roles.data && perms.data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card title="Roles" padded={false}>
            <ul role="listbox" aria-label="Roles">
              {roles.data.map((r) => (
                <li key={r.id}>
                  <button
                    role="option"
                    aria-selected={r.id === selectedId}
                    onClick={() => setSelectedId(r.id)}
                    className={`flex h-auto min-h-12 w-full items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3 text-left last:border-0 ${
                      r.id === selectedId ? "bg-primary-tint text-primary" : "hover:bg-neutral-50"
                    }`}
                  >
                    <span>
                      <span className="block font-semibold">{r.roleName}</span>
                      <span className="block text-caption font-normal text-neutral-500">
                        {r._count.userRoles} user(s) · {r.rolePermissions.length} permission(s)
                        {!r.isActive && " · inactive"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {selected && (
            <Card
              className="lg:col-span-2"
              title={selected.roleName}
              actions={
                <>
                  <Button variant="ghost" size="sm" onClick={toggleActive}>
                    {selected.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
                    Save changes
                  </Button>
                </>
              }
            >
              {selected.description && <p className="mb-4 text-body-sm text-neutral-600">{selected.description}</p>}
              {msg && (
                <div className="mb-4">
                  <Alert tone={msg.tone}>{msg.text}</Alert>
                </div>
              )}
              <div className="flex flex-col gap-6">
                {byModule.map(([module, list]) => (
                  <fieldset key={module}>
                    <legend className="overline mb-3">{module}</legend>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {list.map((p) => (
                        <Checkbox
                          key={p.id}
                          label={p.permissionKey}
                          description={p.description}
                          checked={checked.has(p.permissionKey)}
                          onChange={(on) => toggle(p.permissionKey, on)}
                        />
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New role"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createRole} loading={saving} disabled={newRole.roleName.trim().length < 2}>
              Create role
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Role name" required value={newRole.roleName} onChange={(e) => setNewRole({ ...newRole, roleName: e.target.value })} />
          <Textarea label="Description" value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} rows={2} />
          <p className="text-caption font-normal text-neutral-500">New roles start with no permissions.</p>
        </div>
      </Modal>
    </MainLayout>
  );
}
