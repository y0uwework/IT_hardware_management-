import { useState } from "react";
import { useRouter } from "next/router";
import { ArrowLeftRight, Plus } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { DataTable, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { Input, Select } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { Alert } from "@/components/common/States";
import { toastSetter } from "@/components/common/Toast";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { api, ApiClientError, qs, useApi } from "@/shared/client";
import { hasPermission } from "@/shared/permissions";

interface Row {
  id: number;
  quantityAvailable: number;
  quantityReserved: number;
  quantityIssued: number;
  quantityDamaged: number;
  quantityUnderRepair: number;
  category: { id: number; name: string; code: string; isSerialized: boolean };
  warehouse: { id: number; name: string; code: string };
}

const num = (n: number, tone?: string) => <span className={`tabular-nums ${n === 0 ? "text-neutral-400" : tone ?? ""}`}>{n}</span>;

export default function InventoryPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const search = typeof router.query.search === "string" ? router.query.search : "";
  const warehouseId = typeof router.query.warehouseId === "string" ? router.query.warehouseId : "";
  const page = Number(router.query.page ?? 1) || 1;
  const setQuery = (patch: Record<string, string | number | undefined>) =>
    void router.replace({ query: { ...router.query, page: 1, ...patch } }, undefined, { shallow: true });

  const warehouses = useApi<{ id: number; name: string }[]>(forbidden ? null : "/master-data/warehouses");
  const categories = useApi<{ id: number; name: string; isSerialized: boolean }[]>(forbidden ? null : "/master-data/categories");
  const { data, meta, error, loading, reload } = useApi<Row[]>(
    router.isReady && !forbidden ? `/inventory${qs({ search, warehouseId, page })}` : null
  );

  const [open, setOpen] = useState(false);
  const [mv, setMv] = useState({ categoryId: "", warehouseId: "", movementType: "Receipt", quantity: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const setMvError = toastSetter("error");

  async function saveMovement() {
    setSaving(true);
    setMvError(null);
    try {
      await api("/inventory/movements", { method: "POST", body: mv });
      setOpen(false);
      setMv({ categoryId: "", warehouseId: "", movementType: "Receipt", quantity: "", reason: "" });
      await reload();
    } catch (e) {
      setMvError(e instanceof ApiClientError ? e.message : "Could not record the movement");
    } finally {
      setSaving(false);
    }
  }

  const emptyTransfer = { categoryId: "", fromWarehouseId: "", toWarehouseId: "", quantity: "", reason: "" };
  const [xferOpen, setXferOpen] = useState(false);
  const [xfer, setXfer] = useState(emptyTransfer);
  const sourceStock = useApi<Row[]>(
    xferOpen && xfer.categoryId && xfer.fromWarehouseId
      ? `/inventory${qs({ categoryId: xfer.categoryId, warehouseId: xfer.fromWarehouseId })}`
      : null
  );
  const sourceAvailable = sourceStock.data?.[0]?.quantityAvailable ?? 0;

  async function saveTransfer() {
    setSaving(true);
    setMvError(null);
    try {
      await api("/inventory/transfers", { method: "POST", body: xfer });
      setXferOpen(false);
      setXfer(emptyTransfer);
      setMvError({ tone: "success", text: "Stock transferred." });
      await reload();
    } catch (e) {
      setMvError(e instanceof ApiClientError ? e.message : "Could not transfer the stock");
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<Row>[] = [
    {
      key: "cat",
      header: "Category",
      render: (r) => (
        <span>
          <span className="block font-semibold text-neutral-900">{r.category.name}</span>
          <span className="block text-neutral-500">{r.category.isSerialized ? "Serialized" : "Quantity-tracked"}</span>
        </span>
      ),
    },
    { key: "wh", header: "Warehouse", render: (r) => r.warehouse.name },
    { key: "avail", header: "Available", render: (r) => num(r.quantityAvailable, r.quantityAvailable <= 2 ? "font-bold text-amber-600" : "font-bold") },
    { key: "res", header: "Reserved", hideOnMobile: true, render: (r) => num(r.quantityReserved) },
    { key: "iss", header: "Issued", hideOnMobile: true, render: (r) => num(r.quantityIssued) },
    { key: "rep", header: "Repair", hideOnMobile: true, render: (r) => num(r.quantityUnderRepair) },
    { key: "dmg", header: "Damaged", hideOnMobile: true, render: (r) => num(r.quantityDamaged, "text-error") },
  ];

  return (
    <MainLayout user={user} title="Inventory" forbidden={forbidden}>
      <PageHeader
        title="Inventory"
        subtitle="Stock by category and warehouse."
        actions={
          hasPermission(user, "inventory.manage") && (
            <>
              <Button variant="secondary" onClick={() => setXferOpen(true)}>
                <ArrowLeftRight size={18} aria-hidden="true" /> Transfer stock
              </Button>
              <Button onClick={() => setOpen(true)}>
                <Plus size={18} aria-hidden="true" /> Record movement
              </Button>
            </>
          )
        }
      />
      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:flex-row sm:justify-end sm:p-6">
          <Select
            aria-label="Warehouse"
            value={warehouseId}
            onChange={(e) => setQuery({ warehouseId: e.target.value || undefined })}
            placeholder="All warehouses"
            options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
            wrapperClassName="sm:w-56"
          />
          <SearchInput value={search} onChange={(v) => setQuery({ search: v || undefined })} placeholder="Search category" />
        </div>
        <DataTable columns={columns} rows={data} rowKey={(r) => r.id} loading={loading} error={error} onRetry={reload} emptyTitle="No stock recorded" emptyMessage="Register assets or record a stock receipt to get started." />
        <Pagination meta={meta} onPage={(p) => setQuery({ page: p })} />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record stock movement"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveMovement} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Alert tone="info">For quantity-tracked items (cables, mice, etc.). Serialized devices are added through asset registration.</Alert>
          <Select
            label="Category"
            required
            value={mv.categoryId}
            onChange={(e) => setMv({ ...mv, categoryId: e.target.value })}
            placeholder="Choose a category"
            options={(categories.data ?? []).filter((c) => !c.isSerialized).map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label="Warehouse"
            required
            value={mv.warehouseId}
            onChange={(e) => setMv({ ...mv, warehouseId: e.target.value })}
            placeholder="Choose a warehouse"
            options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
          />
          <Select
            label="Type"
            value={mv.movementType}
            onChange={(e) => setMv({ ...mv, movementType: e.target.value })}
            options={[
              { value: "Receipt", label: "Receipt (stock in)" },
              { value: "Adjustment", label: "Adjustment (+/−)" },
            ]}
          />
          <Input
            label="Quantity"
            required
            type="number"
            value={mv.quantity}
            onChange={(e) => setMv({ ...mv, quantity: e.target.value })}
            helper={mv.movementType === "Adjustment" ? "Use a negative number to reduce stock." : undefined}
          />
          <Input label="Reason" required value={mv.reason} onChange={(e) => setMv({ ...mv, reason: e.target.value })} placeholder="e.g. Delivery note DN-4471" />
        </div>
      </Modal>

      <Modal
        open={xferOpen}
        onClose={() => setXferOpen(false)}
        title="Transfer stock between warehouses"
        footer={
          <>
            <Button variant="ghost" onClick={() => setXferOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveTransfer} loading={saving}>
              Transfer
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Alert tone="info">Moves available quantity-tracked stock. Serialized devices are transferred one by one from the asset page.</Alert>
          <Select
            label="Category"
            required
            value={xfer.categoryId}
            onChange={(e) => setXfer({ ...xfer, categoryId: e.target.value })}
            placeholder="Choose a category"
            options={(categories.data ?? []).filter((c) => !c.isSerialized).map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label="From warehouse"
            required
            value={xfer.fromWarehouseId}
            onChange={(e) => setXfer({ ...xfer, fromWarehouseId: e.target.value })}
            placeholder="Choose a warehouse"
            options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
          />
          <Select
            label="To warehouse"
            required
            value={xfer.toWarehouseId}
            onChange={(e) => setXfer({ ...xfer, toWarehouseId: e.target.value })}
            placeholder="Choose a warehouse"
            options={(warehouses.data ?? []).filter((w) => String(w.id) !== xfer.fromWarehouseId).map((w) => ({ value: w.id, label: w.name }))}
          />
          <Input
            label="Quantity"
            required
            type="number"
            min={1}
            value={xfer.quantity}
            onChange={(e) => setXfer({ ...xfer, quantity: e.target.value })}
            helper={xfer.categoryId && xfer.fromWarehouseId ? `${sourceAvailable} available in the source warehouse.` : undefined}
          />
          <Input label="Reason" required value={xfer.reason} onChange={(e) => setXfer({ ...xfer, reason: e.target.value })} placeholder="e.g. Rebalancing stock for branch office" />
        </div>
      </Modal>
    </MainLayout>
  );
}
