import { useState } from "react";
import { Plus } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { DataTable, FilterChips, type Column } from "@/components/common/DataTable";
import { Checkbox, Input } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Alert } from "@/components/common/States";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { api, ApiClientError, useApi } from "@/shared/client";

interface Category {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSerialized: boolean;
  isActive: boolean;
}
interface Warehouse {
  id: number;
  code: string;
  name: string;
  location: string | null;
  isActive: boolean;
}

type Tab = "categories" | "warehouses";

export default function MasterDataPage({ user, forbidden }: ProtectedPageProps) {
  const [tab, setTab] = useState<Tab>("categories");
  const categories = useApi<Category[]>(forbidden ? null : "/master-data/categories?all=true");
  const warehouses = useApi<Warehouse[]>(forbidden ? null : "/master-data/warehouses?all=true");

  const [editing, setEditing] = useState<{ kind: Tab; id: number | null; values: Record<string, string | boolean> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function openNew() {
    setError(null);
    setFieldErrors({});
    setEditing(
      tab === "categories"
        ? { kind: tab, id: null, values: { code: "", name: "", description: "", isSerialized: true, isActive: true } }
        : { kind: tab, id: null, values: { code: "", name: "", location: "", isActive: true } }
    );
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});
    const base = editing.kind === "categories" ? "/master-data/categories" : "/master-data/warehouses";
    const body = { ...editing.values };
    for (const k of ["description", "location"]) if (body[k] === "") body[k] = null as never;
    try {
      await api(editing.id ? `${base}/${editing.id}` : base, { method: editing.id ? "PUT" : "POST", body });
      setEditing(null);
      await (editing.kind === "categories" ? categories.reload() : warehouses.reload());
    } catch (e) {
      if (e instanceof ApiClientError) {
        setError(e.message);
        setFieldErrors(e.fieldErrors);
      } else setError("Could not save");
    } finally {
      setSaving(false);
    }
  }

  const activeBadge = (on: boolean) => <StatusBadge status={on ? "Active" : "Inactive"} tone={on ? "success" : "neutral"} />;

  const catCols: Column<Category>[] = [
    { key: "code", header: "Code", render: (c) => <span className="font-mono">{c.code}</span> },
    { key: "name", header: "Name", render: (c) => c.name },
    { key: "type", header: "Tracking", render: (c) => (c.isSerialized ? "Serialized" : "Quantity") },
    { key: "active", header: "Status", render: (c) => activeBadge(c.isActive) },
  ];
  const whCols: Column<Warehouse>[] = [
    { key: "code", header: "Code", render: (w) => <span className="font-mono">{w.code}</span> },
    { key: "name", header: "Name", render: (w) => w.name },
    { key: "loc", header: "Location", hideOnMobile: true, render: (w) => w.location ?? "—" },
    { key: "active", header: "Status", render: (w) => activeBadge(w.isActive) },
  ];

  const v = editing?.values ?? {};
  const setV = (k: string, val: string | boolean) => setEditing((e) => (e ? { ...e, values: { ...e.values, [k]: val } } : e));

  return (
    <MainLayout user={user} title="Master data" forbidden={forbidden}>
      <PageHeader
        title="Master data"
        subtitle="Hardware categories and warehouses."
        actions={
          <Button onClick={openNew}>
            <Plus size={18} aria-hidden="true" /> {tab === "categories" ? "New category" : "New warehouse"}
          </Button>
        }
      />
      <div className="mb-4">
        <FilterChips
          options={[
            { value: "categories", label: "Hardware categories" },
            { value: "warehouses", label: "Warehouses" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <Card padded={false}>
        {tab === "categories" ? (
          <DataTable
            columns={catCols}
            rows={categories.data}
            rowKey={(c) => c.id}
            loading={categories.loading}
            error={categories.error}
            onRetry={categories.reload}
            emptyTitle="No categories yet"
            onRowClick={(c) =>
              setEditing({
                kind: "categories",
                id: c.id,
                values: { code: c.code, name: c.name, description: c.description ?? "", isSerialized: c.isSerialized, isActive: c.isActive },
              })
            }
          />
        ) : (
          <DataTable
            columns={whCols}
            rows={warehouses.data}
            rowKey={(w) => w.id}
            loading={warehouses.loading}
            error={warehouses.error}
            onRetry={warehouses.reload}
            emptyTitle="No warehouses yet"
            onRowClick={(w) =>
              setEditing({ kind: "warehouses", id: w.id, values: { code: w.code, name: w.name, location: w.location ?? "", isActive: w.isActive } })
            }
          />
        )}
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`${editing?.id ? "Edit" : "New"} ${editing?.kind === "categories" ? "category" : "warehouse"}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert>{error}</Alert>}
          <Input label="Code" required value={String(v.code ?? "")} onChange={(e) => setV("code", e.target.value.toUpperCase())} error={fieldErrors.code} className="font-mono" />
          <Input label="Name" required value={String(v.name ?? "")} onChange={(e) => setV("name", e.target.value)} error={fieldErrors.name} />
          {editing?.kind === "categories" ? (
            <>
              <Input label="Description" value={String(v.description ?? "")} onChange={(e) => setV("description", e.target.value)} />
              <Checkbox
                label="Serialized (track each unit as an asset)"
                description="Turn off for consumables tracked by quantity only."
                checked={!!v.isSerialized}
                onChange={(on) => setV("isSerialized", on)}
              />
            </>
          ) : (
            <Input label="Location" value={String(v.location ?? "")} onChange={(e) => setV("location", e.target.value)} />
          )}
          <Checkbox label="Active" checked={!!v.isActive} onChange={(on) => setV("isActive", on)} />
        </div>
      </Modal>
    </MainLayout>
  );
}
