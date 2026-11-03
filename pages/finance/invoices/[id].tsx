import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Checkbox, Input, Select, Textarea } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { Alert, ErrorState } from "@/components/common/States";
import { InfoGrid, Stat, today, useMutation } from "@/components/common/Workflow";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { formatDate, formatMoney, useApi } from "@/lib/client";
import { hasPermission } from "@/lib/permissions";
import { appConfig } from "@/config/app.config";
import { INVOICE_STATUS } from "@/config/status.config";

export const getServerSideProps = withPageAuth(["finance.invoice.verify", "finance.invoice.approve", "finance.payment.manage"]);

interface Invoice {
  id: number;
  referenceNumber: string;
  vendorInvoiceNumber: string;
  status: string;
  invoiceDate: string;
  dueDate: string | null;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  outstanding: number;
  attachmentReference: string | null;
  discrepancyNotes: string | null;
  notes: string | null;
  createdAt: string;
  verifiedAt: string | null;
  approvedAt: string | null;
  verifiedByUserId: number | null;
  vendor: { id: number; name: string; gstin: string | null };
  purchaseOrder: { id: number; poNumber: string; department: string | null };
  createdBy: { fullName: string };
  verifiedBy: { fullName: string } | null;
  approvedBy: { fullName: string } | null;
  lines: { id: number; description: string; quantity: number; unitPrice: string; taxRate: string; lineTotal: string; poUnitPrice: number; poTaxRate: number; acceptedQuantity: number; otherInvoicedQuantity: number }[];
  matchIssues: string[];
  events: { id: number; action: string; comments: string | null; createdAt: string; actor: { fullName: string } }[];
  payments: { id: number; paymentNumber: string; paymentDate: string; amount: string; tdsAmount: string; paymentMode: string; paymentReference: string; recordedBy: { fullName: string } }[];
}

type Dialog = "verify" | "approve" | "reject" | "pay" | null;

export default function InvoicePage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const id = Number(router.query.id);
  const { data: inv, error, loading, reload } = useApi<Invoice>(router.isReady && !forbidden ? `/invoices/${id}` : null);
  const m = useMutation();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [comments, setComments] = useState("");
  const [accept, setAccept] = useState(false);
  const [pay, setPay] = useState({ paymentDate: today(), amount: "", tdsAmount: "", paymentMode: "NEFT", paymentReference: "", notes: "" });

  const canVerify = inv && hasPermission(user, "finance.invoice.verify") && [INVOICE_STATUS.RECEIVED, INVOICE_STATUS.DISCREPANCY].includes(inv.status as never);
  const canApprove = inv && hasPermission(user, "finance.invoice.approve") && inv.status === INVOICE_STATUS.VERIFIED && inv.verifiedByUserId !== user.id;
  const canReject = inv && (canVerify || (hasPermission(user, "finance.invoice.approve") && inv.status === INVOICE_STATUS.VERIFIED));
  const canPay = inv && hasPermission(user, "finance.payment.manage") && [INVOICE_STATUS.APPROVED, INVOICE_STATUS.PARTIALLY_PAID].includes(inv.status as never);

  function open(d: Dialog) {
    setComments("");
    setAccept(false);
    m.setFlash(null);
    m.setFieldErrors({});
    if (d === "pay" && inv) setPay({ paymentDate: today(), amount: inv.outstanding.toFixed(2), tdsAmount: "", paymentMode: "NEFT", paymentReference: "", notes: "" });
    setDialog(d);
  }

  async function submit() {
    let ok: unknown = null;
    if (dialog === "verify") ok = await m.run("verify", `/invoices/${id}/verify`, { comments: comments || null, acceptDiscrepancy: accept });
    if (dialog === "approve") ok = await m.run("approve", `/invoices/${id}/approve`, { comments: comments || null });
    if (dialog === "reject") ok = await m.run("reject", `/invoices/${id}/reject`, { reason: comments });
    if (dialog === "pay") ok = await m.run("pay", "/payments", { invoiceId: id, ...pay });
    if (ok) {
      setDialog(null);
      void reload();
    }
  }

  const TITLES: Record<Exclude<Dialog, null>, string> = { verify: "Verify invoice", approve: "Approve for payment", reject: "Reject invoice", pay: "Record payment" };

  return (
    <MainLayout user={user} title={inv?.referenceNumber ?? "Invoice"} forbidden={forbidden}>
      <PageHeader
        title={inv ? `${inv.referenceNumber} · ${inv.vendor.name}` : "Invoice"}
        subtitle={inv && <span className="flex flex-wrap items-center gap-2"><StatusBadge status={inv.status} /> Vendor invoice {inv.vendorInvoiceNumber}</span>}
        breadcrumbs={[{ label: "Invoices", href: "/finance/invoices" }, { label: inv?.referenceNumber ?? "…" }]}
        actions={
          inv && (
            <div className="flex flex-wrap gap-2">
              {canReject && <Button variant="ghost" onClick={() => open("reject")}>Reject</Button>}
              {canVerify && <Button onClick={() => open("verify")}>Verify</Button>}
              {canApprove && <Button onClick={() => open("approve")}>Approve for payment</Button>}
              {canPay && <Button onClick={() => open("pay")}>Record payment</Button>}
            </div>
          )
        }
      />
      {loading && !inv && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {inv && (
        <div className="flex flex-col gap-6">
          {m.flash && !dialog && <Alert tone={m.flash.tone}>{m.flash.text}</Alert>}
          {inv.status === INVOICE_STATUS.VERIFIED && inv.verifiedByUserId === user.id && hasPermission(user, "finance.invoice.approve") && (
            <Alert tone="info">You verified this invoice, so a different approver must approve it.</Alert>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Invoice total" value={formatMoney(inv.totalAmount)} />
            <Stat label="Paid (incl. TDS)" value={formatMoney(inv.paidAmount)} tone={Number(inv.paidAmount) > 0 ? "success" : "default"} />
            <Stat label="Outstanding" value={formatMoney(inv.outstanding)} tone={inv.outstanding > 0 ? "warning" : "success"} />
            <Stat label="3-way match" value={inv.matchIssues.length ? `${inv.matchIssues.length} issue(s)` : "OK"} tone={inv.matchIssues.length ? "error" : "success"} />
          </div>

          {inv.matchIssues.length > 0 && (
            <Alert tone="warning">
              <span className="font-semibold">Differences from the purchase order / goods receipt:</span>
              <ul className="mt-1 list-disc pl-5">{inv.matchIssues.map((i) => <li key={i}>{i}</li>)}</ul>
            </Alert>
          )}

          <Card title="Invoice">
            <InfoGrid
              cols={4}
              items={[
                ["Vendor", <>{inv.vendor.name}{inv.vendor.gstin && <span className="block font-mono text-caption text-neutral-500">{inv.vendor.gstin}</span>}</>],
                ["Purchase order", <Link key="po" className="font-mono hover:underline" href={`/procurement/purchase-orders/${inv.purchaseOrder.id}`}>{inv.purchaseOrder.poNumber}</Link>],
                ["Department", inv.purchaseOrder.department],
                ["Invoice date", formatDate(inv.invoiceDate)],
                ["Due", formatDate(inv.dueDate)],
                ["Entered", `${inv.createdBy.fullName}, ${formatDate(inv.createdAt)}`],
                ["Verified", inv.verifiedBy ? `${inv.verifiedBy.fullName}, ${formatDate(inv.verifiedAt)}` : "—"],
                ["Approved", inv.approvedBy ? `${inv.approvedBy.fullName}, ${formatDate(inv.approvedAt)}` : "—"],
                ["Document", inv.attachmentReference],
              ]}
            />
          </Card>

          <Card title="Lines vs purchase order" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-overline uppercase text-neutral-500">
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 text-right">Invoiced</th>
                    <th className="px-4 py-3 text-right">Accepted (GRN)</th>
                    <th className="px-4 py-3 text-right">Unit price</th>
                    <th className="px-4 py-3 text-right">PO price</th>
                    <th className="px-4 py-3 text-right">GST</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((l) => {
                    const qtyBad = l.quantity > l.acceptedQuantity - l.otherInvoicedQuantity;
                    const priceBad = Math.abs(Number(l.unitPrice) - l.poUnitPrice) > appConfig.invoicePriceTolerance;
                    const taxBad = Number(l.taxRate) !== l.poTaxRate;
                    return (
                      <tr key={l.id} className="border-b border-neutral-200">
                        <td className="px-4 py-3">{l.description}</td>
                        <td className={`px-4 py-3 text-right ${qtyBad ? "font-semibold text-error" : ""}`}>{l.quantity}</td>
                        <td className="px-4 py-3 text-right">{l.acceptedQuantity}{l.otherInvoicedQuantity ? <span className="block text-caption text-neutral-500">{l.otherInvoicedQuantity} on other invoices</span> : null}</td>
                        <td className={`px-4 py-3 text-right ${priceBad ? "font-semibold text-error" : ""}`}>{formatMoney(l.unitPrice)}</td>
                        <td className="px-4 py-3 text-right text-neutral-500">{formatMoney(l.poUnitPrice)}</td>
                        <td className={`px-4 py-3 text-right ${taxBad ? "font-semibold text-error" : ""}`}>{Number(l.taxRate)}%</td>
                        <td className="px-4 py-3 text-right">{formatMoney(l.lineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr><td colSpan={6} className="px-4 pt-3 text-right text-neutral-500">Subtotal</td><td className="px-4 pt-3 text-right">{formatMoney(inv.subtotal)}</td></tr>
                  <tr><td colSpan={6} className="px-4 text-right text-neutral-500">GST</td><td className="px-4 text-right">{formatMoney(inv.taxAmount)}</td></tr>
                  <tr><td colSpan={6} className="px-4 pb-3 text-right font-semibold">Total</td><td className="px-4 pb-3 text-right font-semibold">{formatMoney(inv.totalAmount)}</td></tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card title={`Payments (${inv.payments.length})`} padded={false}>
              {inv.payments.length === 0 ? (
                <p className="px-6 py-8 text-center text-body-sm text-neutral-500">No payments yet.</p>
              ) : (
                <ul>
                  {inv.payments.map((p) => (
                    <li key={p.id} className="flex justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-0 sm:px-6">
                      <span>
                        <span className="block font-mono font-semibold">{p.paymentNumber}</span>
                        <span className="block text-caption text-neutral-500">{formatDate(p.paymentDate)} · {p.paymentMode} {p.paymentReference} · {p.recordedBy.fullName}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold">{formatMoney(p.amount)}</span>
                        {Number(p.tdsAmount) > 0 && <span className="block text-caption text-neutral-500">+ TDS {formatMoney(p.tdsAmount)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="History" padded={false}>
              <ol>
                {inv.events.map((e) => (
                  <li key={e.id} className="border-b border-neutral-200 px-4 py-3 last:border-0 sm:px-6">
                    <p className="font-semibold">{e.action} <span className="font-normal text-neutral-500">· {e.actor.fullName} · {formatDate(e.createdAt, true)}</span></p>
                    {e.comments && <p className="whitespace-pre-line text-body-sm text-neutral-700">{e.comments}</p>}
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      )}

      <Modal
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog ? TITLES[dialog] : ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>Back</Button>
            <Button variant={dialog === "reject" ? "destructive" : "primary"} onClick={submit} loading={!!m.busy}>{dialog ? TITLES[dialog] : ""}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {m.flash?.tone === "error" && <Alert>{m.flash.text}</Alert>}
          {dialog === "verify" && inv && (
            <>
              <p className="text-body-sm">
                {inv.matchIssues.length
                  ? "The 3-way match found differences. Verifying normally records a discrepancy for the vendor to fix; tick below only if the difference is acceptable."
                  : "Quantities, prices and tax match the purchase order and goods receipt."}
              </p>
              {inv.matchIssues.length > 0 && <Checkbox label="Accept the discrepancy and verify anyway" checked={accept} onChange={setAccept} />}
            </>
          )}
          {dialog === "approve" && inv && <p className="text-body-sm">Approve <span className="font-semibold">{formatMoney(inv.totalAmount)}</span> to {inv.vendor.name} for payment.</p>}
          {dialog === "pay" && inv ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label="Payment date" type="date" required value={pay.paymentDate} onChange={(e) => setPay({ ...pay, paymentDate: e.target.value })} />
              <Select label="Mode" value={pay.paymentMode} options={appConfig.paymentModes.map((p) => ({ value: p, label: p }))} onChange={(e) => setPay({ ...pay, paymentMode: e.target.value })} />
              <Input label="Amount paid" type="number" min={0} step="0.01" required value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} error={m.fieldErrors.amount} helper={`Outstanding ${formatMoney(inv.outstanding)}`} />
              <Input label="TDS deducted" type="number" min={0} step="0.01" value={pay.tdsAmount} onChange={(e) => setPay({ ...pay, tdsAmount: e.target.value })} helper="Counts towards settling the invoice." />
              <Input label="UTR / cheque no." required wrapperClassName="md:col-span-2" value={pay.paymentReference} onChange={(e) => setPay({ ...pay, paymentReference: e.target.value })} error={m.fieldErrors.paymentReference} />
              <Textarea label="Notes" wrapperClassName="md:col-span-2" rows={2} value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} />
            </div>
          ) : (
            <Textarea
              label={dialog === "reject" ? "Reason" : "Comments"}
              required={dialog === "reject" || (dialog === "verify" && accept)}
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              error={m.fieldErrors.comments ?? m.fieldErrors.reason}
            />
          )}
        </div>
      </Modal>
    </MainLayout>
  );
}
