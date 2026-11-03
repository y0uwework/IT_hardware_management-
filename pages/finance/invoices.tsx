import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Plus } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { DataTable, FilterChips, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { Input, Select, Textarea } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Alert } from "@/components/common/States";
import { today, useMutation } from "@/components/common/Workflow";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { api, formatDate, formatMoney, qs, useApi } from "@/lib/client";
import { hasPermission } from "@/lib/permissions";
import { appConfig } from "@/config/app.config";
import { INVOICE_STATUS, PO_STATUS } from "@/config/status.config";

export const getServerSideProps = withPageAuth(["finance.invoice.verify", "finance.invoice.approve", "finance.payment.manage"]);

interface Row {
  id: number;
  referenceNumber: string;
  vendorInvoiceNumber: string;
  status: string;
  invoiceDate: string;
  dueDate: string | null;
  totalAmount: string;
  paidAmount: string;
  vendor: { name: string };
  purchaseOrder: { poNumber: string };
}
interface Draft {
  id: number;
  poNumber: string;
  vendorName: string;
  lines: { purchaseOrderItemId: number; description: string; orderedQuantity: number; acceptedQuantity: number; invoicedQuantity: number; suggestedQuantity: number; unitPrice: number; taxRate: number }[];
}
type Line = { purchaseOrderItemId: number; include: boolean; quantity: string; unitPrice: string; taxRate: string };

const SETTLED = [INVOICE_STATUS.PAID, INVOICE_STATUS.REJECTED] as string[];

export default function InvoicesPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const defaultTab = hasPermission(user, "finance.invoice.verify")
    ? ""
    : hasPermission(user, "finance.invoice.approve")
      ? INVOICE_STATUS.VERIFIED
      : INVOICE_STATUS.APPROVED;
  const [status, setStatus] = useState<string>(defaultTab);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const overdue = status === "overdue";
  const list = useApi<Row[]>(forbidden ? null : `/invoices${qs({ status: overdue ? undefined : status, overdue: overdue || undefined, search, page })}`);
  const canEnter = hasPermission(user, "finance.invoice.verify");

  const [open, setOpen] = useState(false);
  const [poId, setPoId] = useState("");
  const pos = useApi<{ id: number; poNumber: string; status: string; vendor: { name: string } }[]>(open ? `/purchase-orders${qs({ limit: 100 })}` : null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [head, setHead] = useState({ vendorInvoiceNumber: "", invoiceDate: today(), dueDate: "", attachmentReference: "", notes: "" });
  const [lines, setLines] = useState<Line[]>([]);
  const m = useMutation();

  // /finance/invoices?po=12 opens the form for that purchase order (link from the PO page).
  useEffect(() => {
    if (router.isReady && typeof router.query.po === "string" && canEnter) {
      startFor(router.query.po);
      void router.replace({ pathname: router.pathname }, undefined, { shallow: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  function startFor(id: string) {
    setOpen(true);
    m.setFlash(null);
    m.setFieldErrors({});
    setHead({ vendorInvoiceNumber: "", invoiceDate: today(), dueDate: "", attachmentReference: "", notes: "" });
    void loadDraft(id);
  }

  async function loadDraft(id: string) {
    setPoId(id);
    setDraft(null);
    if (!id) return;
    try {
      const r = await api<Draft>(`/invoices/draft?purchaseOrderId=${id}`);
      setDraft(r.data);
      setLines(r.data.lines.map((l) => ({ purchaseOrderItemId: l.purchaseOrderItemId, include: l.suggestedQuantity > 0, quantity: String(l.suggestedQuantity || ""), unitPrice: String(l.unitPrice), taxRate: String(l.taxRate) })));
    } catch {
      m.setFlash({ tone: "error", text: "Could not load the purchase order" });
    }
  }

  async function save() {
    const r = await m.run<{ id: number }>("save", "/invoices", {
      purchaseOrderId: poId,
      ...head,
      lines: lines.filter((l) => l.include).map(({ include: _i, ...l }) => l),
    });
    if (r) void router.push(`/finance/invoices/${r.id}`);
  }

  const total = lines.filter((l) => l.include).reduce((s, l) => {
    const net = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
    return s + net + (net * (Number(l.taxRate) || 0)) / 100;
  }, 0);

  const columns: Column<Row>[] = [
    {
      key: "ref",
      header: "Invoice",
      render: (i) => (
        <span>
          <span className="block font-mono text-neutral-900">{i.referenceNumber}</span>
          <span className="block text-neutral-500">{i.vendor.name} · {i.vendorInvoiceNumber}</span>
        </span>
      ),
    },
    { key: "po", header: "PO", hideOnMobile: true, render: (i) => <span className="font-mono">{i.purchaseOrder.poNumber}</span> },
    { key: "date", header: "Date", hideOnMobile: true, render: (i) => formatDate(i.invoiceDate) },
    {
      key: "due",
      header: "Due",
      hideOnMobile: true,
      render: (i) => {
        const late = i.dueDate && new Date(i.dueDate) < new Date() && !SETTLED.includes(i.status);
        return <span className={late ? "font-semibold text-error" : ""}>{formatDate(i.dueDate)}{late ? " · overdue" : ""}</span>;
      },
    },
    { key: "total", header: "Total", render: (i) => formatMoney(i.totalAmount) },
    { key: "paid", header: "Paid", hideOnMobile: true, render: (i) => formatMoney(i.paidAmount) },
    { key: "status", header: "Status", render: (i) => <StatusBadge status={i.status} /> },
  ];

  const invoiceable = (pos.data ?? []).filter((p) => [PO_STATUS.SENT_TO_VENDOR, PO_STATUS.PARTIALLY_RECEIVED, PO_STATUS.FULLY_RECEIVED, PO_STATUS.CLOSED].includes(p.status as never));

  return (
    <MainLayout user={user} title="Invoices" forbidden={forbidden}>
      <PageHeader
        title="Vendor invoices"
        subtitle="Entered → verified against PO and goods receipt → approved → paid."
        actions={
          canEnter && (
            <Button onClick={() => startFor("")}>
              <Plus size={18} aria-hidden="true" /> Enter invoice
            </Button>
          )
        }
      />
      <Card padded={false}>
        <div className="flex flex-col gap-4 border-b border-neutral-200 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips
            options={[
              { value: "", label: "All" },
              { value: INVOICE_STATUS.RECEIVED, label: "To verify" },
              { value: INVOICE_STATUS.DISCREPANCY, label: "Discrepancy" },
              { value: INVOICE_STATUS.VERIFIED, label: "To approve" },
              { value: INVOICE_STATUS.APPROVED, label: "To pay" },
              { value: INVOICE_STATUS.PARTIALLY_PAID, label: "Part paid" },
              { value: INVOICE_STATUS.PAID, label: "Paid" },
              { value: "overdue", label: "Overdue" },
            ]}
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
          />
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search invoice, vendor, PO" />
        </div>
        <DataTable
          columns={columns}
          rows={list.data}
          rowKey={(i) => i.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle="No invoices here"
          emptyMessage={canEnter ? "Enter an invoice once the vendor bills a purchase order." : undefined}
          onRowClick={(i) => void router.push(`/finance/invoices/${i.id}`)}
        />
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Enter vendor invoice"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={!!m.busy}>Cancel</Button>
            <Button onClick={save} loading={!!m.busy} disabled={!draft || !lines.some((l) => l.include)}>Save invoice</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {m.flash?.tone === "error" && <Alert>{m.flash.text}</Alert>}
          <Select
            label="Purchase order"
            required
            value={poId}
            placeholder={pos.loading ? "Loading…" : "Choose a purchase order"}
            options={[
              ...invoiceable.map((p) => ({ value: p.id, label: `${p.poNumber} · ${p.vendor.name} (${p.status})` })),
              ...(draft && !invoiceable.some((p) => p.id === draft.id) ? [{ value: draft.id, label: `${draft.poNumber} · ${draft.vendorName}` }] : []),
            ]}
            onChange={(e) => void loadDraft(e.target.value)}
            error={m.fieldErrors.purchaseOrderId}
          />
          {draft && (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input label="Vendor invoice no." required value={head.vendorInvoiceNumber} onChange={(e) => setHead({ ...head, vendorInvoiceNumber: e.target.value })} error={m.fieldErrors.vendorInvoiceNumber} />
                <Input label="Invoice date" type="date" required value={head.invoiceDate} onChange={(e) => setHead({ ...head, invoiceDate: e.target.value })} error={m.fieldErrors.invoiceDate} />
                <Input label="Due date" type="date" value={head.dueDate} onChange={(e) => setHead({ ...head, dueDate: e.target.value })} helper="Defaults from vendor payment terms." />
              </div>
              <div className="flex flex-col gap-2">
                <p className="eyebrow">Lines (as billed by the vendor)</p>
                {draft.lines.map((d, i) => {
                  const l = lines[i];
                  const upd = (patch: Partial<Line>) => setLines((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div key={d.purchaseOrderItemId} className={`rounded-md border p-3 ${l.include ? "border-neutral-300" : "border-neutral-200 opacity-60"}`}>
                      <label className="flex items-start gap-2 text-body-sm">
                        <input type="checkbox" className="mt-1" checked={l.include} onChange={(e) => upd({ include: e.target.checked })} />
                        <span>
                          <span className="font-semibold">{d.description}</span>
                          <span className="block text-caption text-neutral-500">
                            Ordered {d.orderedQuantity} · accepted {d.acceptedQuantity} · already invoiced {d.invoicedQuantity} · PO price {formatMoney(d.unitPrice)} + {d.taxRate}%
                          </span>
                        </span>
                      </label>
                      {l.include && (
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <Input label="Qty" type="number" min={1} value={l.quantity} onChange={(e) => upd({ quantity: e.target.value })} error={m.fieldErrors[`lines.${i}.quantity`]} />
                          <Input label="Unit price" type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => upd({ unitPrice: e.target.value })} />
                          <Select label="GST %" value={l.taxRate} options={appConfig.taxRates.map((t) => ({ value: t, label: `${t}%` }))} onChange={(e) => upd({ taxRate: e.target.value })} />
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="text-right text-body-sm">Invoice total: <span className="font-semibold">{formatMoney(total)}</span></p>
              </div>
              <Input label="Document reference" value={head.attachmentReference} onChange={(e) => setHead({ ...head, attachmentReference: e.target.value })} helper="Where the scanned invoice is filed (DMS link or share path)." />
              <Textarea label="Notes" rows={2} value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} />
            </>
          )}
        </div>
      </Modal>
    </MainLayout>
  );
}
