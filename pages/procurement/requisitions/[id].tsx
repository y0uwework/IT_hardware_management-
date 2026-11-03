import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Check, Plus } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Input, Select, Textarea } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { Alert, ErrorState } from "@/components/common/States";
import { InfoGrid, today, useMutation } from "@/components/common/Workflow";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { formatDate, formatMoney, useApi } from "@/lib/client";
import { appConfig } from "@/config/app.config";
import { PR_STATUS, QUOTATION_STATUS } from "@/config/status.config";

export const getServerSideProps = withPageAuth("procurement.manage");

interface Detail {
  id: number;
  prNumber: string;
  title: string;
  status: string;
  department: string | null;
  costCentre: string | null;
  requiredDate: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: { fullName: string };
  items: {
    id: number;
    description: string;
    quantity: number;
    estimatedUnitPrice: string | null;
    category: { name: string };
    item: { code: string; name: string } | null;
    request: { id: number; requestNumber: string; requesterName: string } | null;
  }[];
  quotations: {
    id: number;
    quotationNumber: string;
    vendorReference: string | null;
    quoteDate: string;
    validUntil: string | null;
    deliveryDays: number | null;
    paymentTerms: string | null;
    subtotal: string;
    taxAmount: string;
    totalAmount: string;
    status: string;
    selectionReason: string | null;
    vendor: { id: number; name: string; code: string };
    items: { requisitionItemId: number; quantity: number; unitPrice: string; taxRate: string; lineTotal: string; remarks: string | null }[];
  }[];
  purchaseOrders: { id: number; poNumber: string; status: string; totalAmount: string; vendorName: string }[];
}

type QuoteLine = { requisitionItemId: number; quantity: string; unitPrice: string; taxRate: string; remarks: string };

export default function RequisitionDetailPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const id = Number(router.query.id);
  const { data: pr, error, loading, reload } = useApi<Detail>(router.isReady && !forbidden ? `/purchase-requisitions/${id}` : null);
  const m = useMutation();

  const [quoteOpen, setQuoteOpen] = useState(false);
  const vendors = useApi<{ id: number; name: string; code: string }[]>(quoteOpen ? "/vendors/options" : null);
  const [quote, setQuote] = useState({ vendorId: "", vendorReference: "", quoteDate: today(), validUntil: "", deliveryDays: "", paymentTerms: "", notes: "" });
  const [qLines, setQLines] = useState<QuoteLine[]>([]);

  const [selecting, setSelecting] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [poFrom, setPoFrom] = useState<number | null>(null);
  const warehouses = useApi<{ id: number; name: string }[]>(poFrom ? "/master-data/warehouses" : null);
  const [po, setPo] = useState({ deliveryWarehouseId: "", expectedDate: "", terms: "" });
  const [cancelOpen, setCancelOpen] = useState(false);

  const canQuote = pr && [PR_STATUS.OPEN, PR_STATUS.QUOTATION].includes(pr.status as never);

  function openQuote() {
    if (!pr) return;
    setQuote({ vendorId: "", vendorReference: "", quoteDate: today(), validUntil: "", deliveryDays: "", paymentTerms: "", notes: "" });
    setQLines(pr.items.map((i) => ({ requisitionItemId: i.id, quantity: String(i.quantity), unitPrice: "", taxRate: "18", remarks: "" })));
    m.setFlash(null);
    m.setFieldErrors({});
    setQuoteOpen(true);
  }

  async function saveQuote() {
    const r = await m.run("quote", "/quotations", {
      requisitionId: id,
      ...quote,
      lines: qLines.filter((l) => l.unitPrice !== "").map((l) => ({ ...l, remarks: l.remarks || null })),
    });
    if (r) {
      setQuoteOpen(false);
      void reload();
    }
  }

  async function select() {
    if (!selecting) return;
    if (await m.run("select", `/quotations/${selecting}/select`, { reason })) {
      setSelecting(null);
      void reload();
    }
  }

  async function raisePo() {
    const r = await m.run<{ id: number }>("po", "/purchase-orders/from-quotation", { quotationId: poFrom, ...po });
    if (r) void router.push(`/procurement/purchase-orders/${r.id}`);
  }

  async function cancel() {
    if (await m.run("cancel", `/purchase-requisitions/${id}/cancel`, { reason })) {
      setCancelOpen(false);
      void reload();
    }
  }

  // Lowest quoted unit price per requisition line, for highlighting.
  const best = new Map<number, number>();
  pr?.quotations.forEach((q) =>
    q.items.forEach((i) => {
      const p = Number(i.unitPrice);
      if (!best.has(i.requisitionItemId) || p < best.get(i.requisitionItemId)!) best.set(i.requisitionItemId, p);
    })
  );
  const lowestTotal = pr?.quotations.length ? Math.min(...pr.quotations.map((q) => Number(q.totalAmount))) : null;
  const selected = pr?.quotations.find((q) => q.status === QUOTATION_STATUS.SELECTED);
  const livePo = pr?.purchaseOrders.find((p) => p.status !== "Cancelled");

  return (
    <MainLayout user={user} title={pr?.prNumber ?? "Requisition"} forbidden={forbidden}>
      <PageHeader
        title={pr ? `${pr.prNumber} · ${pr.title}` : "Requisition"}
        subtitle={pr && <StatusBadge status={pr.status} />}
        breadcrumbs={[{ label: "Requisitions", href: "/procurement/requisitions" }, { label: pr?.prNumber ?? "…" }]}
        actions={
          pr && (
            <>
              {canQuote && (
                <Button variant="ghost" onClick={() => { setReason(""); setCancelOpen(true); }}>Cancel requisition</Button>
              )}
              {canQuote && (
                <Button variant="secondary" onClick={openQuote}>
                  <Plus size={18} aria-hidden="true" /> Record quotation
                </Button>
              )}
              {selected && !livePo && (
                <Button onClick={() => { m.setFlash(null); setPo({ deliveryWarehouseId: "", expectedDate: "", terms: "" }); setPoFrom(selected.id); }}>
                  Raise purchase order
                </Button>
              )}
            </>
          )
        }
      />
      {loading && !pr && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {pr && (
        <div className="flex flex-col gap-6">
          {m.flash && !quoteOpen && !selecting && !poFrom && !cancelOpen && <Alert tone={m.flash.tone}>{m.flash.text}</Alert>}
          {livePo && (
            <Alert tone="info">
              Ordered on <Link className="font-semibold underline" href={`/procurement/purchase-orders/${livePo.id}`}>{livePo.poNumber}</Link> with {livePo.vendorName} ({livePo.status}).
            </Alert>
          )}
          <Card title="Details">
            <InfoGrid
              cols={4}
              items={[
                ["Department", pr.department],
                ["Cost centre", pr.costCentre],
                ["Needed by", formatDate(pr.requiredDate)],
                ["Raised", `${formatDate(pr.createdAt)} by ${pr.createdBy.fullName}`],
              ]}
            />
            {pr.notes && <p className="mt-4 whitespace-pre-line text-body-sm text-neutral-700">{pr.notes}</p>}
          </Card>

          <Card title={`Quotation comparison (${pr.quotations.length})`} padded={false}>
            {pr.quotations.length === 0 ? (
              <p className="px-6 py-8 text-center text-body-sm text-neutral-500">
                No quotations yet. Record at least two or three vendor quotes to compare.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-body-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 align-bottom">
                      <th className="px-4 py-3 text-overline uppercase text-neutral-500">Line</th>
                      {pr.quotations.map((q) => (
                        <th key={q.id} className={`px-4 py-3 ${q.status === QUOTATION_STATUS.SELECTED ? "bg-primary-tint" : ""}`}>
                          <span className="block font-semibold text-neutral-900">{q.vendor.name}</span>
                          <span className="block font-mono text-caption font-normal text-neutral-500">{q.quotationNumber}</span>
                          <span className="mt-1 block"><StatusBadge status={q.status} /></span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pr.items.map((it) => (
                      <tr key={it.id} className="border-b border-neutral-200">
                        <td className="px-4 py-3">
                          <span className="block font-semibold">{it.quantity} × {it.item?.name ?? it.category.name}</span>
                          <span className="block max-w-xs truncate text-neutral-500">{it.description}</span>
                        </td>
                        {pr.quotations.map((q) => {
                          const l = q.items.find((x) => x.requisitionItemId === it.id);
                          const isBest = l && Number(l.unitPrice) === best.get(it.id);
                          return (
                            <td key={q.id} className={`px-4 py-3 align-top ${q.status === QUOTATION_STATUS.SELECTED ? "bg-primary-tint/50" : ""}`}>
                              {l ? (
                                <>
                                  <span className={`block ${isBest ? "font-semibold text-green-700" : ""}`}>
                                    {formatMoney(l.unitPrice)} {isBest && pr.quotations.length > 1 && "· lowest"}
                                  </span>
                                  <span className="block text-caption text-neutral-500">
                                    {l.quantity} units · GST {Number(l.taxRate)}% · {formatMoney(l.lineTotal)}
                                  </span>
                                  {l.remarks && <span className="block text-caption text-neutral-500">{l.remarks}</span>}
                                </>
                              ) : (
                                <span className="text-neutral-400">Not quoted</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="border-b border-neutral-200 bg-neutral-50">
                      <td className="px-4 py-3 font-semibold">Total (incl. tax)</td>
                      {pr.quotations.map((q) => (
                        <td key={q.id} className={`px-4 py-3 font-semibold ${Number(q.totalAmount) === lowestTotal ? "text-green-700" : ""}`}>
                          {formatMoney(q.totalAmount)}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-neutral-200">
                      <td className="px-4 py-3 text-neutral-500">Delivery · validity · terms</td>
                      {pr.quotations.map((q) => (
                        <td key={q.id} className="px-4 py-3 text-caption text-neutral-600">
                          {q.deliveryDays != null ? `${q.deliveryDays} days` : "—"} · valid to {formatDate(q.validUntil)}
                          {q.paymentTerms && <span className="block">{q.paymentTerms}</span>}
                          {q.selectionReason && <span className="mt-1 block text-neutral-800">Why: {q.selectionReason}</span>}
                        </td>
                      ))}
                    </tr>
                    {canQuote && (
                      <tr>
                        <td />
                        {pr.quotations.map((q) => (
                          <td key={q.id} className="px-4 py-3">
                            {q.status !== QUOTATION_STATUS.SELECTED && (
                              <Button size="sm" variant="secondary" onClick={() => { setReason(""); m.setFlash(null); setSelecting(q.id); }}>
                                <Check size={14} aria-hidden="true" /> Select
                              </Button>
                            )}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Lines" padded={false}>
            <ul>
              {pr.items.map((it) => (
                <li key={it.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-0 sm:px-6">
                  <span className="min-w-0">
                    <span className="block font-semibold">{it.quantity} × {it.item?.name ?? it.category.name}</span>
                    <span className="block text-body-sm text-neutral-600">{it.description}</span>
                  </span>
                  <span className="text-right text-body-sm text-neutral-600">
                    {it.request && (
                      <Link className="block hover:underline" href={`/requests/${it.request.id}`}>
                        {it.request.requestNumber} · {it.request.requesterName}
                      </Link>
                    )}
                    Est. {formatMoney(it.estimatedUnitPrice)} each
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Modal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        size="lg"
        title="Record vendor quotation"
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuoteOpen(false)} disabled={!!m.busy}>Cancel</Button>
            <Button onClick={saveQuote} loading={m.busy === "quote"}>Save quotation</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {m.flash?.tone === "error" && <Alert>{m.flash.text}</Alert>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select label="Vendor" required value={quote.vendorId} placeholder="Choose a vendor" options={(vendors.data ?? []).map((v) => ({ value: v.id, label: `${v.name} (${v.code})` }))} onChange={(e) => setQuote({ ...quote, vendorId: e.target.value })} error={m.fieldErrors.vendorId} />
            <Input label="Vendor's quote ref." value={quote.vendorReference} onChange={(e) => setQuote({ ...quote, vendorReference: e.target.value })} />
            <Input label="Quote date" type="date" required value={quote.quoteDate} onChange={(e) => setQuote({ ...quote, quoteDate: e.target.value })} error={m.fieldErrors.quoteDate} />
            <Input label="Valid until" type="date" value={quote.validUntil} onChange={(e) => setQuote({ ...quote, validUntil: e.target.value })} />
            <Input label="Delivery (days)" type="number" min={0} value={quote.deliveryDays} onChange={(e) => setQuote({ ...quote, deliveryDays: e.target.value })} />
            <Input label="Payment terms" value={quote.paymentTerms} onChange={(e) => setQuote({ ...quote, paymentTerms: e.target.value })} placeholder="e.g. 30 days after delivery" />
          </div>
          <div className="flex flex-col gap-3">
            <p className="eyebrow">Prices (leave a price blank if the vendor didn&apos;t quote that line)</p>
            {pr?.items.map((it, i) => {
              const l = qLines[i];
              if (!l) return null;
              const upd = (patch: Partial<QuoteLine>) => setQLines((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={it.id} className="rounded-md border border-neutral-200 p-3">
                  <p className="mb-2 text-body-sm font-semibold">{it.item?.name ?? it.category.name}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Input label="Qty" type="number" min={1} value={l.quantity} onChange={(e) => upd({ quantity: e.target.value })} />
                    <Input label="Unit price" type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => upd({ unitPrice: e.target.value })} error={m.fieldErrors[`lines.${i}.unitPrice`]} />
                    <Select label="GST %" value={l.taxRate} options={appConfig.taxRates.map((t) => ({ value: t, label: `${t}%` }))} onChange={(e) => upd({ taxRate: e.target.value })} />
                    <Input label="Remarks" value={l.remarks} onChange={(e) => upd({ remarks: e.target.value })} placeholder="Brand, model…" />
                  </div>
                </div>
              );
            })}
            {m.fieldErrors.lines && <p className="text-caption text-error">{m.fieldErrors.lines}</p>}
          </div>
          <Textarea label="Notes" rows={2} value={quote.notes} onChange={(e) => setQuote({ ...quote, notes: e.target.value })} />
        </div>
      </Modal>

      <Modal
        open={!!selecting}
        onClose={() => setSelecting(null)}
        title="Select this vendor"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelecting(null)}>Cancel</Button>
            <Button onClick={select} loading={m.busy === "select"}>Select vendor</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {m.flash?.tone === "error" && <Alert>{m.flash.text}</Alert>}
          <Textarea label="Reason for selection" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={m.fieldErrors.reason} helper="e.g. Lowest total price and fastest delivery." />
        </div>
      </Modal>

      <Modal
        open={!!poFrom}
        onClose={() => setPoFrom(null)}
        title="Raise purchase order"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPoFrom(null)}>Cancel</Button>
            <Button onClick={raisePo} loading={m.busy === "po"}>Create draft PO</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {m.flash?.tone === "error" && <Alert>{m.flash.text}</Alert>}
          <p className="text-body-sm text-neutral-600">A draft PO is created from the selected quotation. Submit it for approval from the PO page.</p>
          <Select label="Deliver to warehouse" required value={po.deliveryWarehouseId} placeholder="Choose a warehouse" options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))} onChange={(e) => setPo({ ...po, deliveryWarehouseId: e.target.value })} error={m.fieldErrors.deliveryWarehouseId} />
          <Input label="Expected delivery" type="date" value={po.expectedDate} onChange={(e) => setPo({ ...po, expectedDate: e.target.value })} helper="Defaults to quote date + quoted delivery days." />
          <Textarea label="Terms" rows={3} value={po.terms} onChange={(e) => setPo({ ...po, terms: e.target.value })} />
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel requisition"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep it</Button>
            <Button variant="destructive" onClick={cancel} loading={m.busy === "cancel"}>Cancel requisition</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {m.flash?.tone === "error" && <Alert>{m.flash.text}</Alert>}
          <p className="text-body-sm text-neutral-600">Its request lines go back to the &quot;waiting to be procured&quot; list.</p>
          <Textarea label="Reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={m.fieldErrors.reason} />
        </div>
      </Modal>
    </MainLayout>
  );
}
