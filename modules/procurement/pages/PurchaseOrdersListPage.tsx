import { useState } from "react";
import { useRouter } from "next/router";
import { Plus } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { ButtonLink } from "@/components/common/Button";
import { DataTable, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { Select } from "@/components/common/FormField";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { formatDate, formatMoney, qs, useApi } from "@/shared/client";
import { hasPermission } from "@/shared/permissions";
import { PO_STATUS } from "@/shared/config/status.config";

interface Row {
  id: number;
  poNumber: string;
  status: string;
  orderDate: string;
  expectedDate: string | null;
  department: string | null;
  totalAmount: string;
  vendor: { name: string };
  warehouse: { name: string };
  requisition: { prNumber: string } | null;
}

export default function PurchaseOrdersPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  // Approvers land on what needs their decision; store staff on what they can receive.
  const initial = typeof router.query.status === "string"
    ? router.query.status
    : !hasPermission(user, "procurement.manage") && hasPermission(user, "procurement.po.approve")
      ? PO_STATUS.PENDING_APPROVAL
      : "";
  const [status, setStatus] = useState(initial);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const list = useApi<Row[]>(forbidden ? null : `/purchase-orders${qs({ status, search, page })}`);

  const columns: Column<Row>[] = [
    {
      key: "po",
      header: "PO",
      render: (p) => (
        <span>
          <span className="block font-mono text-neutral-900">{p.poNumber}</span>
          <span className="block text-neutral-500">{p.vendor.name}</span>
        </span>
      ),
    },
    { key: "pr", header: "Requisition", hideOnMobile: true, render: (p) => <span className="font-mono">{p.requisition?.prNumber ?? "—"}</span> },
    { key: "dept", header: "Department", hideOnMobile: true, render: (p) => p.department ?? "—" },
    { key: "date", header: "Ordered", hideOnMobile: true, render: (p) => formatDate(p.orderDate) },
    {
      key: "expected",
      header: "Expected",
      hideOnMobile: true,
      render: (p) => {
        const late = p.expectedDate && new Date(p.expectedDate) < new Date() && [PO_STATUS.APPROVED, PO_STATUS.SENT_TO_VENDOR, PO_STATUS.PARTIALLY_RECEIVED].includes(p.status as never);
        return <span className={late ? "font-semibold text-error" : ""}>{formatDate(p.expectedDate)}{late ? " · late" : ""}</span>;
      },
    },
    { key: "total", header: "Total", render: (p) => formatMoney(p.totalAmount) },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <MainLayout user={user} title="Purchase orders" forbidden={forbidden}>
      <PageHeader
        title="Purchase orders"
        subtitle="Draft → approval → sent to vendor → received."
        actions={
          hasPermission(user, "procurement.manage") && (
            <ButtonLink href="/procurement/purchase-orders/create">
              <Plus size={18} aria-hidden="true" /> New PO
            </ButtonLink>
          )
        }
      />
      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:flex-row sm:justify-end sm:p-6">
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            placeholder="All statuses"
            options={Object.values(PO_STATUS).map((s) => ({ value: s, label: s }))}
            wrapperClassName="sm:w-56"
          />
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search PO, vendor, department" />
        </div>
        <DataTable
          columns={columns}
          rows={list.data}
          rowKey={(p) => p.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle="No purchase orders"
          emptyMessage="Raise one from a selected quotation, or create a PO directly."
          onRowClick={(p) => void router.push(`/procurement/purchase-orders/${p.id}`)}
        />
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
    </MainLayout>
  );
}
