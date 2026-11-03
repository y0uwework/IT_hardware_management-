import { useState } from "react";
import { useRouter } from "next/router";
import { Download } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button, ButtonLink } from "@/components/common/Button";
import { DataTable, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { Input } from "@/components/common/FormField";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { api, formatDate, formatMoney, qs, useApi } from "@/shared/client";
import { downloadCsv } from "@/shared/download";
import { INVOICE_STATUS } from "@/shared/config/status.config";

interface Row {
  id: number;
  paymentNumber: string;
  paymentDate: string;
  amount: string;
  tdsAmount: string;
  paymentMode: string;
  paymentReference: string;
  invoice: { id: number; referenceNumber: string; vendorInvoiceNumber: string };
  vendor: { name: string };
  recordedBy: { fullName: string };
}

export default function PaymentsPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const list = useApi<{ items: Row[]; sum: string }>(forbidden ? null : `/payments${qs({ search, from, to, page })}`);

  async function exportCsv() {
    const r = await api<{ items: Row[] }>(`/payments${qs({ search, from, to, limit: 100 })}`);
    downloadCsv("payments.csv", [
      ["Payment", "Date", "Vendor", "Invoice", "Vendor invoice", "Mode", "Reference", "Amount", "TDS"],
      ...r.data.items.map((p) => [p.paymentNumber, p.paymentDate.slice(0, 10), p.vendor.name, p.invoice.referenceNumber, p.invoice.vendorInvoiceNumber, p.paymentMode, p.paymentReference, p.amount, p.tdsAmount]),
    ]);
  }

  const columns: Column<Row>[] = [
    { key: "no", header: "Payment", render: (p) => <span className="font-mono">{p.paymentNumber}</span> },
    { key: "date", header: "Date", render: (p) => formatDate(p.paymentDate) },
    {
      key: "vendor",
      header: "Vendor / invoice",
      render: (p) => (
        <span>
          <span className="block">{p.vendor.name}</span>
          <span className="block font-mono text-neutral-500">{p.invoice.referenceNumber}</span>
        </span>
      ),
    },
    { key: "mode", header: "Mode", hideOnMobile: true, render: (p) => `${p.paymentMode} · ${p.paymentReference}` },
    { key: "amount", header: "Amount", render: (p) => formatMoney(p.amount) },
    { key: "tds", header: "TDS", hideOnMobile: true, render: (p) => (Number(p.tdsAmount) ? formatMoney(p.tdsAmount) : "—") },
    { key: "by", header: "Recorded by", hideOnMobile: true, render: (p) => p.recordedBy.fullName },
  ];

  return (
    <MainLayout user={user} title="Payments" forbidden={forbidden}>
      <PageHeader
        title="Payments"
        subtitle="Money paid to vendors against approved invoices."
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => void exportCsv()}>
              <Download size={18} aria-hidden="true" /> Export
            </Button>
            <ButtonLink href="/finance/invoices" variant="secondary">
              Invoices to pay
            </ButtonLink>
          </div>
        }
      />
      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex gap-3">
            <Input label="From" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            <Input label="To" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            {list.data && <p className="text-body-sm text-neutral-600">Total paid in view: <span className="font-semibold text-neutral-900">{formatMoney(list.data.sum)}</span></p>}
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search payment, UTR, vendor" />
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.items ?? null}
          rowKey={(p) => p.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle="No payments"
          emptyMessage={`Record payments from an invoice in "${INVOICE_STATUS.APPROVED}" status.`}
          onRowClick={(p) => void router.push(`/finance/invoices/${p.invoice.id}`)}
        />
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
    </MainLayout>
  );
}
