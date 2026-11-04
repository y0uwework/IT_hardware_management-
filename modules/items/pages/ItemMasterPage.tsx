import { useState } from "react";
import { Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { DataTable, FilterChips, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { Select } from "@/components/common/FormField";
import { ConfirmDialog } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { toastSetter } from "@/components/common/Toast";
import { ItemFormModal } from "@/modules/items/pages/components/ItemFormModal";
import { BulkUploadModal, downloadItemSample } from "@/modules/items/pages/components/BulkUploadModal";
import type { CategoryOption, ItemRow } from "@/modules/items/items.types";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { api, ApiClientError, formatMoney, qs, useApi } from "@/shared/client";
import { hasPermission } from "@/shared/permissions";

type StatusFilter = "" | "active" | "inactive";

export default function ItemMasterPage({ user, forbidden }: ProtectedPageProps) {
  const canCreate = hasPermission(user, "item.create");
  const canEdit = hasPermission(user, "item.edit");
  const canDelete = hasPermission(user, "item.delete");
  const canBulk = hasPermission(user, "item.bulk_upload");

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [page, setPage] = useState(1);

  const items = useApi<ItemRow[]>(forbidden ? null : `/items${qs({ search, categoryId, status, page })}`);
  const categories = useApi<CategoryOption[]>(
    forbidden ? null : `/master-data/categories${hasPermission(user, "admin.master_data.manage") ? "?all=true" : ""}`
  );
  const categoryList = categories.data ?? [];

  const [editing, setEditing] = useState<{ item: ItemRow | null } | null>(null);
  const [deleting, setDeleting] = useState<ItemRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const setMsg = toastSetter("error");

  const filter = (fn: () => void) => {
    fn();
    setPage(1);
  };

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/items/${deleting.id}`, { method: "DELETE" });
      setMsg({ tone: "success", text: `Deleted ${deleting.code} — ${deleting.name}.` });
      setDeleting(null);
      await items.reload();
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiClientError ? e.message : "Could not delete the item" });
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  const columns: Column<ItemRow>[] = [
    { key: "code", header: "Code", render: (i) => <span className="font-mono">{i.code}</span> },
    {
      key: "name",
      header: "Item",
      render: (i) => (
        <span>
          <span className="block text-neutral-900">{i.name}</span>
          <span className="block text-neutral-500">{[i.manufacturer, i.model].filter(Boolean).join(" ") || "—"}</span>
        </span>
      ),
    },
    { key: "category", header: "Category", hideOnMobile: true, render: (i) => i.category.name },
    { key: "type", header: "Type", hideOnMobile: true, render: (i) => i.itemType },
    { key: "uom", header: "UoM", hideOnMobile: true, render: (i) => i.unitOfMeasure },
    { key: "cost", header: "Std. cost", hideOnMobile: true, render: (i) => (i.standardCost ? formatMoney(i.standardCost) : "—") },
    {
      key: "status",
      header: "Status",
      render: (i) => <StatusBadge status={i.isActive ? "Active" : "Inactive"} tone={i.isActive ? "success" : "neutral"} />,
    },
  ];
  if (canEdit || canDelete) {
    columns.push({
      key: "actions",
      header: "",
      className: "text-right",
      render: (i) => (
        <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
          {canEdit && (
            <Button variant="ghost" size="sm" className="px-3" onClick={() => setEditing({ item: i })} aria-label={`Edit ${i.code}`}>
              <Pencil size={16} aria-hidden="true" />
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="sm" className="px-3 text-error" onClick={() => setDeleting(i)} aria-label={`Delete ${i.code}`}>
              <Trash2 size={16} aria-hidden="true" />
            </Button>
          )}
        </span>
      ),
    });
  }

  return (
    <MainLayout user={user} title="Item master" forbidden={forbidden}>
      <PageHeader
        title="Item master"
        subtitle="Items people can request, each linked to a hardware category."
        actions={
          <div className="flex flex-wrap gap-2">
            {canBulk && (
              <>
                {/* <Button variant="ghost" onClick={() => downloadItemSample(categoryList)}>
                  <Download size={18} aria-hidden="true" /> Sample sheet
                </Button> */}
                <Button variant="secondary" onClick={() => setBulkOpen(true)}>
                  <Upload size={18} aria-hidden="true" /> Bulk upload
                </Button>
              </>
            )}
            {canCreate && (
              <Button onClick={() => setEditing({ item: null })}>
                <Plus size={18} aria-hidden="true" /> Add item
              </Button>
            )}
          </div>
        }
      />
      <Card padded={false}>
        <div className="flex flex-col gap-4 border-b border-neutral-200 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips<StatusFilter>
            options={[
              { value: "", label: "All" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            value={status}
            onChange={(v) => filter(() => setStatus(v))}
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select
              aria-label="Filter by category"
              value={categoryId}
              onChange={(e) => filter(() => setCategoryId(e.target.value))}
              placeholder="All categories"
              options={categoryList.map((c) => ({ value: c.id, label: c.name }))}
              wrapperClassName="sm:w-56"
            />
            <SearchInput value={search} onChange={(v) => filter(() => setSearch(v))} placeholder="Search code, name, model" />
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={items.data}
          rowKey={(i) => i.id}
          loading={items.loading}
          error={items.error}
          onRetry={items.reload}
          emptyTitle="No items found"
          emptyMessage={canCreate ? "Add an item or bulk upload a sheet to get started." : "Try a different filter."}
          onRowClick={canEdit ? (i) => setEditing({ item: i }) : undefined}
        />
        <Pagination meta={items.meta} onPage={setPage} />
      </Card>

      <ItemFormModal
        open={!!editing}
        item={editing?.item ?? null}
        categories={categoryList}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setMsg({ tone: "success", text: editing?.item ? "Item updated." : "Item added." });
          setEditing(null);
          void items.reload();
        }}
      />

      <BulkUploadModal open={bulkOpen} categories={categoryList} onClose={() => setBulkOpen(false)} onUploaded={() => void items.reload()} />

      <ConfirmDialog
        open={!!deleting}
        title="Delete item?"
        message={
          deleting
            ? `${deleting.code} — ${deleting.name} will be removed from the item master and can no longer be requested. Existing requests keep showing it.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </MainLayout>
  );
}
