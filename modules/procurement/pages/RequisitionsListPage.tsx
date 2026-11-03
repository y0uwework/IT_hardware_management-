import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Plus, Trash2 } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { DataTable, FilterChips, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { Input, Select, Textarea } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Alert } from "@/components/common/States";
import { useMutation } from "@/components/common/Workflow";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { formatDate, formatMoney, qs, useApi } from "@/shared/client";
import { PR_STATUS } from "@/shared/config/status.config";

interface Row {
  id: number;
  prNumber: string;
  title: string;
  status: string;
  department: string | null;
  requiredDate: string | null;
  createdAt: string;
  lineCount: number;
  quotationCount: number;
  estimatedValue: string | null;
  createdBy: { fullName: string };
}
interface PendingLine {
  requestItemId: number;
  requestId: number;
  requestNumber: string;
  requesterName: string;
  department: string | null;
  categoryName: string;
  itemCode: string | null;
  itemName: string | null;
  specification: string;
  estimatedUnitPrice: string | null;
  outstanding: number;
}
interface ItemOption {
  id: number;
  code: string;
  name: string;
  standardCost: string | null;
}

export default function RequisitionsPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const list = useApi<Row[]>(forbidden ? null : `/purchase-requisitions${qs({ status, search, page })}`);
  const pending = useApi<PendingLine[]>(forbidden ? null : "/purchase-requisitions/pending-lines");

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [requiredDate, setRequiredDate] = useState("");
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [extra, setExtra] = useState<{ itemId: string; quantity: string; estimatedUnitPrice: string }[]>([]);
  const items = useApi<ItemOption[]>(open ? "/items/options" : null);
  const m = useMutation();

  function start(ids: number[] = []) {
    setTitle(ids.length ? `Procurement for ${Array.from(new Set(pending.data?.filter((p) => ids.includes(p.requestItemId)).map((p) => p.requestNumber))).join(", ")}` : "");
    setRequiredDate("");
    setNotes("");
    setPicked(ids);
    setExtra([]);
    m.setFlash(null);
    m.setFieldErrors({});
    setOpen(true);
  }

  async function create() {
    const r = await m.run<{ id: number }>("create", "/purchase-requisitions", {
      title,
      requiredDate,
      notes,
      requestItemIds: picked,
      lines: extra.filter((l) => l.itemId).map((l) => ({ ...l, estimatedUnitPrice: l.estimatedUnitPrice || null })),
    });
    if (r) void router.push(`/procurement/requisitions/${r.id}`);
  }

  const columns: Column<Row>[] = [
    {
      key: "pr",
      header: "Requisition",
      render: (r) => (
        <span>
          <span className="block font-mono text-neutral-900">{r.prNumber}</span>
          <span className="block max-w-xs truncate text-neutral-500">{r.title}</span>
        </span>
      ),
    },
    { key: "dept", header: "Department", hideOnMobile: true, render: (r) => r.department ?? "—" },
    { key: "lines", header: "Lines", hideOnMobile: true, render: (r) => r.lineCount },
    { key: "quotes", header: "Quotes", hideOnMobile: true, render: (r) => r.quotationCount },
    { key: "value", header: "Est. value", hideOnMobile: true, render: (r) => formatMoney(r.estimatedValue) },
    { key: "date", header: "Created", hideOnMobile: true, render: (r) => formatDate(r.createdAt) },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  const pendingCount = pending.data?.length ?? 0;

  return (
    <MainLayout user={user} title="Purchase requisitions" forbidden={forbidden}>
      <PageHeader
        title="Purchase requisitions"
        subtitle="Collect what needs buying, gather vendor quotations and pick the best offer."
        actions={
          <Button onClick={() => start()}>
            <Plus size={18} aria-hidden="true" /> New requisition
          </Button>
        }
      />

      {pendingCount > 0 && (
        <Card
          className="mb-6"
          padded={false}
          title={`Waiting to be procured (${pendingCount})`}
          actions={
            <Button size="sm" onClick={() => start(pending.data!.map((p) => p.requestItemId))}>
              Requisition all
            </Button>
          }
        >
          <ul>
            {pending.data!.map((p) => (
              <li key={p.requestItemId} className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-0 sm:px-6">
                <span className="min-w-0">
                  <span className="block font-semibold">
                    {p.outstanding} × {p.itemName ?? p.categoryName}
                    {p.itemCode && <span className="ml-2 font-mono text-caption font-normal text-neutral-500">{p.itemCode}</span>}
                  </span>
                  <span className="block truncate text-body-sm text-neutral-500">
                    <Link className="hover:underline" href={`/requests/${p.requestId}`}>{p.requestNumber}</Link> · {p.requesterName}
                    {p.department && ` · ${p.department}`} · {p.specification}
                  </span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => start([p.requestItemId])}>Requisition</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card padded={false}>
        <div className="flex flex-col gap-4 border-b border-neutral-200 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips
            options={[{ value: "", label: "All" }, ...Object.values(PR_STATUS).map((s) => ({ value: s, label: s }))]}
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
          />
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search number, title" />
        </div>
        <DataTable
          columns={columns}
          rows={list.data}
          rowKey={(r) => r.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle="No requisitions yet"
          emptyMessage="When IT marks request items for procurement they appear above, ready to requisition."
          onRowClick={(r) => void router.push(`/procurement/requisitions/${r.id}`)}
        />
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="New purchase requisition"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={!!m.busy}>Cancel</Button>
            <Button onClick={create} loading={!!m.busy} disabled={!picked.length && !extra.some((l) => l.itemId)}>Create requisition</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {m.flash?.tone === "error" && <Alert>{m.flash.text}</Alert>}
          <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} error={m.fieldErrors.title} placeholder="e.g. Laptops for Q3 joiners" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Needed by" type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
          </div>
          {pendingCount > 0 && (
            <fieldset className="rounded-md border border-neutral-200 p-3">
              <legend className="eyebrow px-1">From employee requests</legend>
              <div className="flex flex-col gap-2">
                {pending.data!.map((p) => (
                  <label key={p.requestItemId} className="flex cursor-pointer items-start gap-2 text-body-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={picked.includes(p.requestItemId)}
                      onChange={(e) => setPicked((s) => (e.target.checked ? [...s, p.requestItemId] : s.filter((x) => x !== p.requestItemId)))}
                    />
                    <span>
                      <span className="font-semibold">{p.outstanding} × {p.itemName ?? p.categoryName}</span>{" "}
                      <span className="text-neutral-500">— {p.requestNumber}, {p.requesterName}{p.department ? `, ${p.department}` : ""}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset className="rounded-md border border-neutral-200 p-3">
            <legend className="eyebrow px-1">Other items (e.g. buffer stock)</legend>
            <div className="flex flex-col gap-3">
              {extra.map((l, i) => (
                <div key={i} className="grid grid-cols-12 items-end gap-2">
                  <Select
                    label={i === 0 ? "Item" : undefined}
                    wrapperClassName="col-span-12 sm:col-span-6"
                    value={l.itemId}
                    placeholder="Choose an item"
                    options={(items.data ?? []).map((o) => ({ value: o.id, label: `${o.name} (${o.code})` }))}
                    onChange={(e) => {
                      const opt = items.data?.find((o) => String(o.id) === e.target.value);
                      setExtra((s) => s.map((x, j) => (j === i ? { ...x, itemId: e.target.value, estimatedUnitPrice: x.estimatedUnitPrice || opt?.standardCost || "" } : x)));
                    }}
                    error={m.fieldErrors[`lines.${i}.itemId`]}
                  />
                  <Input label={i === 0 ? "Qty" : undefined} wrapperClassName="col-span-4 sm:col-span-2" type="number" min={1} value={l.quantity} onChange={(e) => setExtra((s) => s.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                  <Input label={i === 0 ? "Est. unit price" : undefined} wrapperClassName="col-span-6 sm:col-span-3" type="number" min={0} step="0.01" value={l.estimatedUnitPrice} onChange={(e) => setExtra((s) => s.map((x, j) => (j === i ? { ...x, estimatedUnitPrice: e.target.value } : x)))} />
                  <Button variant="ghost" size="sm" className="col-span-2 sm:col-span-1 px-2" aria-label="Remove line" onClick={() => setExtra((s) => s.filter((_, j) => j !== i))}>
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button variant="secondary" size="sm" className="self-start" onClick={() => setExtra((s) => [...s, { itemId: "", quantity: "1", estimatedUnitPrice: "" }])}>
                <Plus size={16} aria-hidden="true" /> Add item
              </Button>
            </div>
          </fieldset>
          {m.fieldErrors.lines && <p className="text-caption text-error">{m.fieldErrors.lines}</p>}
          <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Modal>
    </MainLayout>
  );
}
