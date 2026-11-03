import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { PackageCheck, Printer } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button, ButtonLink } from "@/components/common/Button";
import { Input, Select, Textarea } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { Alert, ErrorState } from "@/components/common/States";
import { InfoGrid, today, useMutation } from "@/components/common/Workflow";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { formatDate, formatMoney, useApi } from "@/shared/client";
import { hasPermission } from "@/shared/permissions";
import { PO_STATUS } from "@/shared/config/status.config";

interface PoItem {
  id: number;
  description: string;
  quantity: number;
  receivedQuantity: number;
  unitPrice: string;
  taxRate: string;
  lineTotal: string;
  category: { id: number; name: string; isSerialized: boolean };
  item: { code: string; name: string } | null;
  request: { id: number; requestNumber: string } | null;
}
interface PoDetail {
  id: number;
  poNumber: string;
  status: string;
  orderDate: string;
  expectedDate: string | null;
  department: string | null;
  costCentre: string | null;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  terms: string | null;
  notes: string | null;
  approvalComments: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  submittedAt: string | null;
  cancelledReason: string | null;
  createdAt: string;
  createdByUserId: number;
  vendor: { id: number; name: string; code: string; gstin: string | null };
  warehouse: { id: number; name: string };
  createdBy: { fullName: string };
  approvedBy: { fullName: string } | null;
  requisition: { id: number; prNumber: string } | null;
  items: PoItem[];
  receipts: {
    id: number;
    grnNumber: string;
    receivedDate: string;
    deliveryNote: string | null;
    notes: string | null;
    warehouse: { name: string };
    receivedBy: { fullName: string };
    items: { purchaseOrderItemId: number; quantityReceived: number; quantityAccepted: number; quantityRejected: number; rejectionReason: string | null; serialNumbers: string | null }[];
  }[];
  invoices: { id: number; referenceNumber: string; vendorInvoiceNumber: string; status: string; totalAmount: string; paidAmount: string }[];
}

type Action = "submit" | "approve" | "reject" | "send" | "cancel" | "close";
const ACTION_LABEL: Record<Action, string> = {
  submit: "Submit for approval",
  approve: "Approve",
  reject: "Send back",
  send: "Mark sent to vendor",
  cancel: "Cancel PO",
  close: "Close PO",
};
type RecvLine = { purchaseOrderItemId: number; quantityReceived: string; quantityRejected: string; rejectionReason: string; serialNumbers: string };

export default function PurchaseOrderPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const id = Number(router.query.id);
  const { data: po, error, loading, reload } = useApi<PoDetail>(router.isReady && !forbidden ? `/purchase-orders/${id}` : null);
  const m = useMutation();
  const [acting, setActing] = useState<Action | null>(null);
  const [comments, setComments] = useState("");
  const [recvOpen, setRecvOpen] = useState(false);
  const warehouses = useApi<{ id: number; name: string }[]>(recvOpen ? "/master-data/warehouses" : null);
  const [recv, setRecv] = useState({ warehouseId: "", receivedDate: today(), deliveryNote: "", notes: "" });
  const [rLines, setRLines] = useState<RecvLine[]>([]);

  const manage = hasPermission(user, "procurement.manage");
  const approver = hasPermission(user, "procurement.po.approve") && po?.createdByUserId !== user.id;
  const actions: Action[] = [];
  if (po) {
    if (manage && po.status === PO_STATUS.DRAFT) actions.push("submit");
    if (approver && po.status === PO_STATUS.PENDING_APPROVAL) actions.push("reject", "approve");
    if (manage && po.status === PO_STATUS.APPROVED) actions.push("send");
    if (manage && [PO_STATUS.PARTIALLY_RECEIVED, PO_STATUS.FULLY_RECEIVED].includes(po.status as never)) actions.push("close");
    if (manage && [PO_STATUS.DRAFT, PO_STATUS.PENDING_APPROVAL, PO_STATUS.APPROVED, PO_STATUS.SENT_TO_VENDOR].includes(po.status as never) && po.receipts.length === 0)
      actions.unshift("cancel");
  }
  const canReceive = po && hasPermission(user, "procurement.receive") && [PO_STATUS.APPROVED, PO_STATUS.SENT_TO_VENDOR, PO_STATUS.PARTIALLY_RECEIVED].includes(po.status as never);
  const canInvoice = po && hasPermission(user, "finance.invoice.verify") && [PO_STATUS.SENT_TO_VENDOR, PO_STATUS.PARTIALLY_RECEIVED, PO_STATUS.FULLY_RECEIVED, PO_STATUS.CLOSED].includes(po.status as never);
  const needsComment = acting === "reject" || acting === "cancel";

  async function act() {
    if (!acting) return;
    if (await m.run(acting, `/purchase-orders/${id}/${acting}`, { comments: comments || null })) {
      setActing(null);
      void reload();
    }
  }

  function openReceive() {
    if (!po) return;
    setRecv({ warehouseId: String(po.warehouse.id), receivedDate: today(), deliveryNote: "", notes: "" });
    setRLines(
      po.items.map((i) => ({
        purchaseOrderItemId: i.id,
        quantityReceived: String(i.quantity - i.receivedQuantity),
        quantityRejected: "0",
        rejectionReason: "",
        serialNumbers: "",
      }))
    );
    m.setFlash(null);
    m.setFieldErrors({});
    setRecvOpen(true);
  }

  async function receive() {
    const r = await m.run("receive", "/goods-receipts", {
      purchaseOrderId: id,
      ...recv,
      lines: rLines.map((l) => ({ ...l, quantityReceived: Number(l.quantityReceived) || 0, quantityRejected: Number(l.quantityRejected) || 0 })),
    });
    if (r) {
      setRecvOpen(false);
      void reload();
    }
  }

  return (
    <MainLayout user={user} title={po?.poNumber ?? "Purchase order"} forbidden={forbidden}>
      <PageHeader
        title={po ? po.poNumber : "Purchase order"}
        subtitle={po && <span className="flex flex-wrap items-center gap-2"><StatusBadge status={po.status} /> {po.vendor.name}</span>}
        breadcrumbs={[{ label: "Purchase orders", href: "/procurement/purchase-orders" }, { label: po?.poNumber ?? "…" }]}
        actions={
          po && (
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button variant="ghost" onClick={() => window.print()}>
                <Printer size={18} aria-hidden="true" /> Print
              </Button>
              {actions.map((a) => (
                <Button
                  key={a}
                  variant={a === "cancel" || a === "reject" ? "ghost" : a === "close" ? "secondary" : "primary"}
                  onClick={() => { setComments(""); m.setFlash(null); m.setFieldErrors({}); setActing(a); }}
                >
                  {ACTION_LABEL[a]}
                </Button>
              ))}
              {canReceive && (
                <Button onClick={openReceive}>
                  <PackageCheck size={18} aria-hidden="true" /> Receive goods
                </Button>
              )}
              {canInvoice && <ButtonLink href={`/finance/invoices?po=${po.id}`} variant="secondary">Enter invoice</ButtonLink>}
            </div>
          )
        }
      />
      {loading && !po && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {po && (
        <div className="flex flex-col gap-6">
          {m.flash && !acting && !recvOpen && <Alert tone={m.flash.tone}>{m.flash.text}</Alert>}
          {po.status === PO_STATUS.PENDING_APPROVAL && po.createdByUserId === user.id && hasPermission(user, "procurement.po.approve") && (
            <Alert tone="info">You created this order, so someone else has to approve it.</Alert>
          )}
          {po.approvalComments && <Alert tone={po.status === PO_STATUS.DRAFT ? "warning" : "info"}>Approver: {po.approvalComments}</Alert>}
          {po.cancelledReason && <Alert tone="warning">Cancelled: {po.cancelledReason}</Alert>}
          <Card title="Order">
            <InfoGrid
              cols={4}
              items={[
                ["Vendor", <>{po.vendor.name}{po.vendor.gstin && <span className="block font-mono text-caption text-neutral-500">{po.vendor.gstin}</span>}</>],
                ["Deliver to", po.warehouse.name],
                ["Order date", formatDate(po.orderDate)],
                ["Expected", formatDate(po.expectedDate)],
                ["Department", po.department],
                ["Cost centre", po.costCentre],
                ["Requisition", po.requisition ? <Link className="font-mono hover:underline" href={`/procurement/requisitions/${po.requisition.id}`}>{po.requisition.prNumber}</Link> : "—"],
                ["Raised by", `${po.createdBy.fullName}, ${formatDate(po.createdAt)}`],
                ["Approved", po.approvedBy ? `${po.approvedBy.fullName}, ${formatDate(po.approvedAt)}` : "—"],
                ["Sent to vendor", formatDate(po.sentAt)],
              ]}
            />
          </Card>

          <Card title="Lines" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-overline uppercase text-neutral-500">
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Received</th>
                    <th className="px-4 py-3 text-right">Unit price</th>
                    <th className="px-4 py-3 text-right">GST</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {po.items.map((i) => (
                    <tr key={i.id} className="border-b border-neutral-200 align-top">
                      <td className="px-4 py-3">
                        <span className="block font-semibold">{i.item?.name ?? i.category.name}</span>
                        <span className="block text-neutral-500">{i.description}</span>
                        {i.request && <Link className="text-caption text-primary hover:underline" href={`/requests/${i.request.id}`}>for {i.request.requestNumber}</Link>}
                      </td>
                      <td className="px-4 py-3 text-right">{i.quantity}</td>
                      <td className={`px-4 py-3 text-right ${i.receivedQuantity >= i.quantity ? "text-green-700" : ""}`}>{i.receivedQuantity}</td>
                      <td className="px-4 py-3 text-right">{formatMoney(i.unitPrice)}</td>
                      <td className="px-4 py-3 text-right">{Number(i.taxRate)}%</td>
                      <td className="px-4 py-3 text-right">{formatMoney(i.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={5} className="px-4 pt-3 text-right text-neutral-500">Subtotal</td><td className="px-4 pt-3 text-right">{formatMoney(po.subtotal)}</td></tr>
                  <tr><td colSpan={5} className="px-4 text-right text-neutral-500">GST</td><td className="px-4 text-right">{formatMoney(po.taxAmount)}</td></tr>
                  <tr><td colSpan={5} className="px-4 pb-3 text-right font-semibold">Total</td><td className="px-4 pb-3 text-right font-semibold">{formatMoney(po.totalAmount)}</td></tr>
                </tfoot>
              </table>
            </div>
            {po.terms && <p className="whitespace-pre-line border-t border-neutral-200 px-4 py-3 text-body-sm text-neutral-700 sm:px-6"><span className="eyebrow mr-2">Terms</span>{po.terms}</p>}
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card title={`Goods receipts (${po.receipts.length})`} padded={false}>
              {po.receipts.length === 0 ? (
                <p className="px-6 py-8 text-center text-body-sm text-neutral-500">Nothing received yet.</p>
              ) : (
                <ul>
                  {po.receipts.map((g) => (
                    <li key={g.id} className="border-b border-neutral-200 px-4 py-3 last:border-0 sm:px-6">
                      <p className="font-semibold"><span className="font-mono">{g.grnNumber}</span> · {formatDate(g.receivedDate)} · {g.warehouse.name}</p>
                      <p className="text-caption text-neutral-500">By {g.receivedBy.fullName}{g.deliveryNote && ` · DN ${g.deliveryNote}`}</p>
                      <ul className="mt-1 text-body-sm text-neutral-700">
                        {g.items.map((gi) => {
                          const line = po.items.find((x) => x.id === gi.purchaseOrderItemId);
                          return (
                            <li key={gi.purchaseOrderItemId}>
                              {gi.quantityAccepted} × {line?.item?.name ?? line?.category.name} accepted
                              {gi.quantityRejected > 0 && <span className="text-error"> · {gi.quantityRejected} rejected ({gi.rejectionReason})</span>}
                              {gi.serialNumbers && <span className="block font-mono text-caption text-neutral-500">{gi.serialNumbers.split("\n").join(", ")}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={`Invoices (${po.invoices.length})`} padded={false}>
              {po.invoices.length === 0 ? (
                <p className="px-6 py-8 text-center text-body-sm text-neutral-500">No invoices entered.</p>
              ) : (
                <ul>
                  {po.invoices.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-0 sm:px-6">
                      <span>
                        <Link className="font-mono font-semibold hover:underline" href={`/finance/invoices/${inv.id}`}>{inv.referenceNumber}</Link>
                        <span className="block text-caption text-neutral-500">Vendor no. {inv.vendorInvoiceNumber} · paid {formatMoney(inv.paidAmount)}</span>
                      </span>
                      <span className="text-right">
                        <span className="block">{formatMoney(inv.totalAmount)}</span>
                        <StatusBadge status={inv.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      <Modal
        open={!!acting}
        onClose={() => setActing(null)}
        title={acting ? `${ACTION_LABEL[acting]} — ${po?.poNumber}` : ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setActing(null)}>Back</Button>
            <Button variant={acting === "cancel" ? "destructive" : "primary"} onClick={act} loading={!!m.busy}>{acting ? ACTION_LABEL[acting] : ""}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {m.flash?.tone === "error" && <Alert>{m.flash.text}</Alert>}
          {acting === "approve" && po && <p className="text-body-sm">Approve an order of <span className="font-semibold">{formatMoney(po.totalAmount)}</span> with {po.vendor.name}.</p>}
          {acting === "send" && <p className="text-body-sm">Confirm the PO has been emailed or handed to the vendor.</p>}
          {acting === "close" && <p className="text-body-sm">Closing stops further receipts. Do this when the vendor will not deliver the rest.</p>}
          <Textarea
            label={needsComment ? "Reason" : "Comments"}
            required={needsComment}
            rows={3}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            error={m.fieldErrors.comments}
          />
        </div>
      </Modal>

      <Modal
        open={recvOpen}
        onClose={() => setRecvOpen(false)}
        size="lg"
        title={`Receive goods — ${po?.poNumber}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRecvOpen(false)} disabled={!!m.busy}>Cancel</Button>
            <Button onClick={receive} loading={m.busy === "receive"}>Record receipt</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {m.flash?.tone === "error" && <Alert>{m.flash.text}</Alert>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Select label="Warehouse" required value={recv.warehouseId} options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))} onChange={(e) => setRecv({ ...recv, warehouseId: e.target.value })} />
            <Input label="Received on" type="date" required value={recv.receivedDate} onChange={(e) => setRecv({ ...recv, receivedDate: e.target.value })} error={m.fieldErrors.receivedDate} />
            <Input label="Delivery note / challan" value={recv.deliveryNote} onChange={(e) => setRecv({ ...recv, deliveryNote: e.target.value })} />
          </div>
          {po?.items.map((i, idx) => {
            const l = rLines[idx];
            const open = i.quantity - i.receivedQuantity;
            if (!l || open <= 0) return null;
            const upd = (patch: Partial<RecvLine>) => setRLines((s) => s.map((x, j) => (j === idx ? { ...x, ...patch } : x)));
            const accepted = (Number(l.quantityReceived) || 0) - (Number(l.quantityRejected) || 0);
            return (
              <div key={i.id} className="rounded-md border border-neutral-200 p-3">
                <p className="text-body-sm font-semibold">
                  {i.item?.name ?? i.category.name} <span className="font-normal text-neutral-500">— {open} of {i.quantity} still to receive</span>
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Input label="Received" type="number" min={0} max={open} value={l.quantityReceived} onChange={(e) => upd({ quantityReceived: e.target.value })} error={m.fieldErrors[`lines.${idx}.quantityReceived`]} />
                  <Input label="Rejected" type="number" min={0} value={l.quantityRejected} onChange={(e) => upd({ quantityRejected: e.target.value })} error={m.fieldErrors[`lines.${idx}.quantityRejected`]} />
                  {Number(l.quantityRejected) > 0 && (
                    <Input label="Rejection reason" wrapperClassName="col-span-2" value={l.rejectionReason} onChange={(e) => upd({ rejectionReason: e.target.value })} error={m.fieldErrors[`lines.${idx}.rejectionReason`]} />
                  )}
                </div>
                {i.category.isSerialized && accepted > 0 && (
                  <Textarea
                    label={`Serial numbers (${accepted}, one per line)`}
                    wrapperClassName="mt-3"
                    rows={Math.min(6, Math.max(2, accepted))}
                    className="font-mono"
                    value={l.serialNumbers}
                    onChange={(e) => upd({ serialNumbers: e.target.value })}
                    error={m.fieldErrors[`lines.${idx}.serialNumbers`]}
                    helper="Each serial becomes an asset in the register."
                  />
                )}
                {i.request && accepted > 0 && <p className="mt-2 text-caption text-primary">Will be reserved for {i.request.requestNumber}.</p>}
              </div>
            );
          })}
          <Textarea label="Notes" rows={2} value={recv.notes} onChange={(e) => setRecv({ ...recv, notes: e.target.value })} />
        </div>
      </Modal>
    </MainLayout>
  );
}
