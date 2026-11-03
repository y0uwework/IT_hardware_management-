import { useState } from "react";
import { Plus } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { DataTable, FilterChips, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { Checkbox, Input, Textarea } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Alert } from "@/components/common/States";
import { useMutation } from "@/components/common/Workflow";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { qs, useApi } from "@/shared/client";

interface Vendor {
  id: number;
  code: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  paymentTermsDays: number | null;
  bankDetails: string | null;
  notes: string | null;
  isActive: boolean;
  poCount: number;
}

type Form = Record<Exclude<keyof Vendor, "id" | "isActive" | "poCount" | "paymentTermsDays">, string> & { paymentTermsDays: string; isActive: boolean };

const blank = (): Form => ({
  code: "", name: "", gstin: "", pan: "", contactPerson: "", email: "", phone: "", address: "", city: "", state: "",
  pincode: "", paymentTermsDays: "30", bankDetails: "", notes: "", isActive: true,
});
const fromVendor = (v: Vendor): Form => ({
  code: v.code, name: v.name, gstin: v.gstin ?? "", pan: v.pan ?? "", contactPerson: v.contactPerson ?? "", email: v.email ?? "",
  phone: v.phone ?? "", address: v.address ?? "", city: v.city ?? "", state: v.state ?? "", pincode: v.pincode ?? "",
  paymentTermsDays: v.paymentTermsDays?.toString() ?? "", bankDetails: v.bankDetails ?? "", notes: v.notes ?? "", isActive: v.isActive,
});

export default function VendorsPage({ user, forbidden }: ProtectedPageProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [page, setPage] = useState(1);
  const list = useApi<Vendor[]>(forbidden ? null : `/vendors${qs({ search, status, page })}`);
  const [editing, setEditing] = useState<{ id: number | null; form: Form } | null>(null);
  const m = useMutation();

  async function save() {
    if (!editing) return;
    const r = await m.run(editing.id ? "edit" : "new", editing.id ? `/vendors/${editing.id}` : "/vendors", editing.form, editing.id ? "PUT" : "POST");
    if (r) {
      setEditing(null);
      void list.reload();
    }
  }

  const set = (k: keyof Form, v: string | boolean) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));
  const f = editing?.form;
  const err = m.fieldErrors;

  const columns: Column<Vendor>[] = [
    { key: "code", header: "Code", render: (v) => <span className="font-mono">{v.code}</span> },
    {
      key: "name",
      header: "Vendor",
      render: (v) => (
        <span>
          <span className="block text-neutral-900">{v.name}</span>
          <span className="block text-neutral-500">{[v.city, v.state].filter(Boolean).join(", ") || "—"}</span>
        </span>
      ),
    },
    { key: "gstin", header: "GSTIN", hideOnMobile: true, render: (v) => <span className="font-mono">{v.gstin ?? "—"}</span> },
    { key: "contact", header: "Contact", hideOnMobile: true, render: (v) => [v.contactPerson, v.phone].filter(Boolean).join(" · ") || "—" },
    { key: "terms", header: "Terms", hideOnMobile: true, render: (v) => (v.paymentTermsDays != null ? `${v.paymentTermsDays} days` : "—") },
    { key: "pos", header: "POs", hideOnMobile: true, render: (v) => v.poCount },
    { key: "status", header: "Status", render: (v) => <StatusBadge status={v.isActive ? "Active" : "Inactive"} tone={v.isActive ? "success" : "neutral"} /> },
  ];

  return (
    <MainLayout user={user} title="Vendors" forbidden={forbidden}>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers you request quotations from and place purchase orders with."
        actions={
          <Button onClick={() => { m.setFlash(null); m.setFieldErrors({}); setEditing({ id: null, form: blank() }); }}>
            <Plus size={18} aria-hidden="true" /> Add vendor
          </Button>
        }
      />
      <Card padded={false}>
        <div className="flex flex-col gap-4 border-b border-neutral-200 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips<"" | "active" | "inactive">
            options={[{ value: "", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
          />
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, code, GSTIN, city" />
        </div>
        <DataTable
          columns={columns}
          rows={list.data}
          rowKey={(v) => v.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle="No vendors yet"
          emptyMessage="Add the suppliers you buy hardware from."
          onRowClick={(v) => { m.setFlash(null); m.setFieldErrors({}); setEditing({ id: v.id, form: fromVendor(v) }); }}
        />
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing?.id ? `Edit ${f?.name}` : "Add vendor"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={!!m.busy}>Cancel</Button>
            <Button onClick={save} loading={!!m.busy}>Save</Button>
          </>
        }
      >
        {f && (
          <div className="flex flex-col gap-4">
            {m.flash?.tone === "error" && <Alert>{m.flash.text}</Alert>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label="Vendor code" required className="font-mono" value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} error={err.code} />
              <Input label="Name" required value={f.name} onChange={(e) => set("name", e.target.value)} error={err.name} />
              <Input label="GSTIN" className="font-mono" maxLength={15} value={f.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} error={err.gstin} placeholder="27ABCDE1234F1Z5" />
              <Input label="PAN" className="font-mono" maxLength={10} value={f.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} error={err.pan} />
              <Input label="Contact person" value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} error={err.contactPerson} />
              <Input label="Phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} error={err.phone} />
              <Input label="Email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} error={err.email} />
              <Input label="Payment terms (days)" type="number" min={0} value={f.paymentTermsDays} onChange={(e) => set("paymentTermsDays", e.target.value)} error={err.paymentTermsDays} />
              <Textarea label="Address" wrapperClassName="md:col-span-2" rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} error={err.address} />
              <Input label="City" value={f.city} onChange={(e) => set("city", e.target.value)} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="State" value={f.state} onChange={(e) => set("state", e.target.value)} />
                <Input label="PIN code" inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} error={err.pincode} />
              </div>
              <Textarea label="Bank details" wrapperClassName="md:col-span-2" rows={2} value={f.bankDetails} onChange={(e) => set("bankDetails", e.target.value)} helper="Account name, number, IFSC — for payments." />
              <Textarea label="Notes" wrapperClassName="md:col-span-2" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
            <Checkbox label="Active" description="Inactive vendors can't receive new quotations or orders." checked={f.isActive} onChange={(on) => set("isActive", on)} />
          </div>
        )}
      </Modal>
    </MainLayout>
  );
}
