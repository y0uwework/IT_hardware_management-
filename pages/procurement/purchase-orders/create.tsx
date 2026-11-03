import { useState } from "react";
import { useRouter } from "next/router";
import { Plus, Trash2 } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Input, Select, Textarea } from "@/components/common/FormField";
import { Alert } from "@/components/common/States";
import { today, useMutation } from "@/components/common/Workflow";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { formatMoney, useApi } from "@/lib/client";
import { appConfig } from "@/config/app.config";

export const getServerSideProps = withPageAuth("procurement.manage");

interface ItemOption {
  id: number;
  code: string;
  name: string;
  description: string | null;
  standardCost: string | null;
  category: { name: string };
}
type Line = { itemId: string; description: string; quantity: string; unitPrice: string; taxRate: string };
const emptyLine = (): Line => ({ itemId: "", description: "", quantity: "1", unitPrice: "", taxRate: "18" });

export default function CreatePurchaseOrderPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const vendors = useApi<{ id: number; name: string; code: string }[]>(forbidden ? null : "/vendors/options");
  const warehouses = useApi<{ id: number; name: string }[]>(forbidden ? null : "/master-data/warehouses");
  const departments = useApi<string[]>(forbidden ? null : "/finance/departments");
  const items = useApi<ItemOption[]>(forbidden ? null : "/items/options");
  const [h, setH] = useState({ vendorId: "", deliveryWarehouseId: "", orderDate: today(), expectedDate: "", department: "", costCentre: "", terms: "", notes: "" });
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const m = useMutation();

  const upd = (i: number, patch: Partial<Line>) => setLines((s) => s.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const totals = lines.reduce(
    (t, l) => {
      const net = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
      return { net: t.net + net, tax: t.tax + (net * (Number(l.taxRate) || 0)) / 100 };
    },
    { net: 0, tax: 0 }
  );

  async function save() {
    const r = await m.run<{ id: number }>("save", "/purchase-orders", {
      ...h,
      lines: lines.map((l) => ({ ...l, description: l.description || null })),
    });
    if (r) void router.push(`/procurement/purchase-orders/${r.id}`);
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const e = m.fieldErrors;
  return (
    <MainLayout user={user} title="New purchase order" forbidden={forbidden}>
      <PageHeader
        title="New purchase order"
        subtitle="For purchases without a requisition (e.g. buffer stock). PO lines from employee requests come from a requisition's selected quotation."
        breadcrumbs={[{ label: "Purchase orders", href: "/procurement/purchase-orders" }, { label: "New" }]}
      />
      <div className="flex flex-col gap-6">
        {m.flash?.tone === "error" && <Alert>{m.flash.text}</Alert>}
        <Card title="Order">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Select label="Vendor" required value={h.vendorId} placeholder="Choose a vendor" options={(vendors.data ?? []).map((v) => ({ value: v.id, label: `${v.name} (${v.code})` }))} onChange={(ev) => setH({ ...h, vendorId: ev.target.value })} error={e.vendorId} />
            <Select label="Deliver to" required value={h.deliveryWarehouseId} placeholder="Choose a warehouse" options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))} onChange={(ev) => setH({ ...h, deliveryWarehouseId: ev.target.value })} error={e.deliveryWarehouseId} />
            <Select label="Department (budget)" value={h.department} placeholder="None" options={(departments.data ?? []).map((d) => ({ value: d, label: d }))} onChange={(ev) => setH({ ...h, department: ev.target.value })} />
            <Input label="Order date" type="date" value={h.orderDate} onChange={(ev) => setH({ ...h, orderDate: ev.target.value })} />
            <Input label="Expected delivery" type="date" value={h.expectedDate} onChange={(ev) => setH({ ...h, expectedDate: ev.target.value })} />
            <Input label="Cost centre" value={h.costCentre} onChange={(ev) => setH({ ...h, costCentre: ev.target.value })} />
          </div>
        </Card>
        <Card
          title="Lines"
          actions={
            <Button size="sm" variant="secondary" onClick={() => setLines((s) => [...s, emptyLine()])}>
              <Plus size={16} aria-hidden="true" /> Add line
            </Button>
          }
        >
          {e.lines && <p className="mb-3 text-caption text-error">{e.lines}</p>}
          <div className="flex flex-col gap-4">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-3 rounded-md border border-neutral-200 p-3">
                <Select
                  label="Item"
                  required
                  wrapperClassName="col-span-12 md:col-span-5"
                  value={l.itemId}
                  placeholder="Choose an item"
                  options={(items.data ?? []).map((o) => ({ value: o.id, label: `${o.name} (${o.code}) · ${o.category.name}` }))}
                  onChange={(ev) => {
                    const o = items.data?.find((x) => String(x.id) === ev.target.value);
                    upd(i, { itemId: ev.target.value, unitPrice: l.unitPrice || o?.standardCost || "" });
                  }}
                  error={e[`lines.${i}.itemId`]}
                />
                <Input label="Qty" type="number" min={1} wrapperClassName="col-span-4 md:col-span-2" value={l.quantity} onChange={(ev) => upd(i, { quantity: ev.target.value })} error={e[`lines.${i}.quantity`]} />
                <Input label="Unit price" type="number" min={0} step="0.01" wrapperClassName="col-span-8 md:col-span-2" value={l.unitPrice} onChange={(ev) => upd(i, { unitPrice: ev.target.value })} error={e[`lines.${i}.unitPrice`]} />
                <Select label="GST %" wrapperClassName="col-span-8 md:col-span-2" value={l.taxRate} options={appConfig.taxRates.map((t) => ({ value: t, label: `${t}%` }))} onChange={(ev) => upd(i, { taxRate: ev.target.value })} />
                <Button variant="ghost" size="sm" className="col-span-4 px-2 md:col-span-1" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((s) => s.filter((_, j) => j !== i))}>
                  <Trash2 size={16} aria-hidden="true" />
                </Button>
                <Input label="Description on PO" wrapperClassName="col-span-12" value={l.description} onChange={(ev) => upd(i, { description: ev.target.value })} placeholder="Defaults to the item name" />
              </div>
            ))}
          </div>
          <dl className="mt-5 ml-auto grid max-w-xs grid-cols-2 gap-1 text-body-sm">
            <dt className="text-neutral-500">Subtotal</dt><dd className="text-right">{formatMoney(totals.net)}</dd>
            <dt className="text-neutral-500">GST</dt><dd className="text-right">{formatMoney(totals.tax)}</dd>
            <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{formatMoney(totals.net + totals.tax)}</dd>
          </dl>
        </Card>
        <Card title="Terms & notes">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Textarea label="Terms" rows={3} value={h.terms} onChange={(ev) => setH({ ...h, terms: ev.target.value })} placeholder="Delivery, payment and warranty terms" />
            <Textarea label="Internal notes" rows={3} value={h.notes} onChange={(ev) => setH({ ...h, notes: ev.target.value })} />
          </div>
        </Card>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => router.back()} disabled={!!m.busy}>Cancel</Button>
          <Button onClick={save} loading={!!m.busy}>Create draft PO</Button>
        </div>
      </div>
    </MainLayout>
  );
}
