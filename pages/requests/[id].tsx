import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button, ButtonLink } from "@/components/common/Button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ApprovalTimeline } from "@/components/common/ApprovalTimeline";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { Alert, ErrorState } from "@/components/common/States";
import { ConfirmDialog } from "@/components/common/Modal";
import { Input, Textarea } from "@/components/common/FormField";
import { ItReviewPanel } from "@/components/requests/ItReviewPanel";
import { AssignModal } from "@/components/assets/AssignModal";
import { requestItemLabel, type RequestDetail, type RequestItem } from "@/components/requests/types";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { api, ApiClientError, formatDate, formatMoney, useApi } from "@/lib/client";
import { hasPermission } from "@/lib/permissions";
import { REQUEST_STATUS } from "@/config/status.config";

export const getServerSideProps = withPageAuth("request.view");

const IT_STATUSES: string[] = [
  REQUEST_STATUS.APPROVED,
  REQUEST_STATUS.UNDER_IT_REVIEW,
  REQUEST_STATUS.AWAITING_PROCUREMENT,
  REQUEST_STATUS.PARTIALLY_FULFILLED,
];

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-body text-neutral-900">{children}</dd>
    </div>
  );
}

export default function RequestDetailPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const id = Number(router.query.id);
  const { data: r, error, loading, reload } = useApi<RequestDetail>(router.isReady && !forbidden ? `/hardware-requests/${id}` : null);

  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [assignTarget, setAssignTarget] = useState<{ asset: { id: number; assetTag: string }; itemId: number } | null>(null);
  const [release, setRelease] = useState<{ id: number; label: string } | null>(null);
  const [releaseReason, setReleaseReason] = useState("");

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setActionError(e instanceof ApiClientError ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const isOwner = r?.requester.id === user.id;
  const editable = isOwner && (r?.status === REQUEST_STATUS.DRAFT || r?.status === REQUEST_STATUS.RETURNED);
  const cancellable =
    isOwner &&
    [REQUEST_STATUS.DRAFT, REQUEST_STATUS.PENDING_APPROVAL, REQUEST_STATUS.RETURNED, REQUEST_STATUS.APPROVED].includes(
      r?.status as never
    );
  const canReview = !!r && hasPermission(user, "request.it_review") && IT_STATUSES.includes(r.status);
  const canAssign = hasPermission(user, "asset.assign");
  const canRelease = hasPermission(user, "inventory.manage") || hasPermission(user, "request.it_review");
  const fulfilmentOpen = !!r && IT_STATUSES.slice(1).includes(r.status);

  const returnedComment =
    r?.status === REQUEST_STATUS.RETURNED ? [...(r.history ?? [])].reverse().find((h) => h.action === "Returned")?.comments : null;

  return (
    <MainLayout user={user} title={r?.requestNumber ?? "Request"} forbidden={forbidden}>
      <PageHeader
        title={r ? r.requestNumber : "Request"}
        subtitle={r && <span className="flex flex-wrap items-center gap-2"><StatusBadge status={r.status} /> <span>{r.purpose}</span></span>}
        breadcrumbs={[{ label: "Requests", href: "/requests" }, { label: r?.requestNumber ?? "…" }]}
        actions={
          r && (
            <>
              {cancellable && (
                <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                  Cancel request
                </Button>
              )}
              {editable && (
                <ButtonLink href={`/requests/${r.id}/edit`} variant="secondary">
                  Edit
                </ButtonLink>
              )}
              {editable && (
                <Button loading={busy === "submit"} onClick={() => run("submit", () => api(`/hardware-requests/${r.id}/submit`, { method: "POST" }))}>
                  {r.status === REQUEST_STATUS.RETURNED ? "Resubmit" : "Submit for approval"}
                </Button>
              )}
            </>
          )
        }
      />

      {loading && !r && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {r && (
        <div className="flex flex-col gap-6">
          {actionError && <Alert>{actionError}</Alert>}
          {returnedComment && isOwner && (
            <Alert tone="warning">
              <strong>Changes requested:</strong> {returnedComment}
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="flex flex-col gap-6 xl:col-span-2">
              <Card title="Overview">
                <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <Detail label="Requester">
                    {r.requester.fullName}
                    <span className="block text-body-sm text-neutral-500">
                      {r.requester.employeeCode}
                      {r.requester.department ? ` · ${r.requester.department}` : ""}
                    </span>
                  </Detail>
                  <Detail label="Type">{r.requestType}</Detail>
                  <Detail label="Priority">{r.priority}</Detail>
                  <Detail label="Needed by">{formatDate(r.requiredDate)}</Detail>
                  <Detail label="Submitted">{formatDate(r.submittedAt, true)}</Detail>
                  <Detail label="Workflow">{r.workflow ? `${r.workflow.name} (v${r.workflow.version})` : "—"}</Detail>
                  {r.costCentre && <Detail label="Cost centre">{r.costCentre}</Detail>}
                </dl>
                {r.justification && (
                  <div className="mt-6">
                    <p className="eyebrow">Justification</p>
                    <p className="mt-1 whitespace-pre-line text-body text-neutral-800">{r.justification}</p>
                  </div>
                )}
              </Card>

              <Card title={`Items (${r.items.length})`} padded={false}>
                <ul>
                  {r.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      canAssign={canAssign && fulfilmentOpen}
                      canRelease={canRelease && fulfilmentOpen}
                      canIssue={canAssign && fulfilmentOpen}
                      busy={busy}
                      onAssign={(asset) => setAssignTarget({ asset, itemId: item.id })}
                      onRelease={(res) => setRelease(res)}
                      onIssue={(resId) =>
                        run(`issue-${resId}`, () => api(`/inventory/reservations/${resId}/issue`, { method: "POST" }))
                      }
                      isOwner={isOwner}
                      onAcknowledge={(aid) =>
                        run(`ack-${aid}`, () => api(`/assignments/${aid}/acknowledge`, { method: "POST" }))
                      }
                    />
                  ))}
                </ul>
              </Card>

              {canReview && <ItReviewPanel request={r} onSaved={reload} />}
            </div>

            <div className="flex flex-col gap-6">
              {r.tasks.length > 0 && (
                <Card title="Approvals">
                  <ul className="flex flex-col gap-3">
                    {r.tasks
                      .filter((t) => t.status !== "Skipped")
                      .map((t) => (
                        <li key={t.id} className="flex items-start justify-between gap-3">
                          <span>
                            <span className="block text-body-sm font-semibold">{t.stage.name}</span>
                            <span className="block text-caption font-normal text-neutral-500">
                              {t.approver.fullName}
                              {t.actedAt ? ` · ${formatDate(t.actedAt)}` : t.dueAt ? ` · due ${formatDate(t.dueAt)}` : ""}
                            </span>
                          </span>
                          <StatusBadge status={t.status} />
                        </li>
                      ))}
                  </ul>
                </Card>
              )}
              <Card title="Timeline">
                <ApprovalTimeline entries={r.history} />
              </Card>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this request?"
        message="Pending approvals will be closed. This cannot be undone."
        confirmLabel="Cancel request"
        destructive
        loading={busy === "cancel"}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() =>
          run("cancel", () => api(`/hardware-requests/${id}/cancel`, { method: "POST", body: { reason: cancelReason || undefined } })).then(
            () => setConfirmCancel(false)
          )
        }
      >
        <div className="mt-4">
          <Textarea label="Reason (optional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!release}
        title="Release reservation?"
        message={release ? `${release.label} will go back to available stock.` : ""}
        confirmLabel="Release"
        destructive
        loading={busy === "release"}
        onClose={() => setRelease(null)}
        onConfirm={() =>
          release &&
          run("release", () => api(`/inventory/reservations/${release.id}/release`, { method: "POST", body: { reason: releaseReason } })).then(
            () => {
              setRelease(null);
              setReleaseReason("");
            }
          )
        }
      >
        <div className="mt-4">
          <Input label="Reason" required value={releaseReason} onChange={(e) => setReleaseReason(e.target.value)} />
        </div>
      </ConfirmDialog>

      {r && assignTarget && (
        <AssignModal
          open
          onClose={() => setAssignTarget(null)}
          onDone={reload}
          asset={assignTarget.asset}
          fixedUser={{ id: r.requester.id, fullName: r.requester.fullName }}
          requestItemId={assignTarget.itemId}
        />
      )}
    </MainLayout>
  );
}

function ItemRow({
  item,
  canAssign,
  canRelease,
  canIssue,
  busy,
  onAssign,
  onRelease,
  onIssue,
  isOwner,
  onAcknowledge,
}: {
  item: RequestItem;
  canAssign: boolean;
  canRelease: boolean;
  canIssue: boolean;
  busy: string | null;
  onAssign: (asset: { id: number; assetTag: string }) => void;
  onRelease: (r: { id: number; label: string }) => void;
  onIssue: (reservationId: number) => void;
  isOwner: boolean;
  onAcknowledge: (assignmentId: number) => void;
}) {
  const active = item.reservations.filter((r) => r.status === "Active");
  return (
    <li className="border-b border-neutral-200 px-4 py-5 last:border-0 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-headline text-base font-semibold">
            {item.quantity} × {requestItemLabel(item)}
          </p>
          {item.item && (
            <p className="text-caption font-normal text-neutral-500">
              <span className="font-mono">{item.item.code}</span> · {item.category.name}
            </p>
          )}
          <p className="mt-1 whitespace-pre-line text-body-sm text-neutral-700">{item.approvedSpecification ?? item.requestedSpecification}</p>
          {item.approvedSpecification && item.approvedSpecification !== item.requestedSpecification && (
            <p className="mt-1 text-caption font-normal text-neutral-500">Requested: {item.requestedSpecification}</p>
          )}
          {item.itReviewComments && <p className="mt-2 text-body-sm text-neutral-600">IT notes: {item.itReviewComments}</p>}
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <StatusBadge status={item.fulfilmentStatus} />
          <span className="text-caption font-normal text-neutral-500">
            {item.fulfilledQuantity}/{item.quantity} delivered
            {item.procurementQuantity > 0 ? ` · ${item.procurementQuantity} to procure` : ""}
          </span>
          {item.estimatedUnitPrice && (
            <span className="text-caption font-normal text-neutral-500">Est. {formatMoney(item.estimatedUnitPrice)} each</span>
          )}
        </div>
      </div>

      {(active.length > 0 || item.assignments.length > 0) && (
        <ul className="mt-4 flex flex-col gap-2">
          {active.map((res) => (
            <li key={res.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-neutral-50 px-3 py-2 text-body-sm">
              <span>
                <StatusBadge status="Reserved" tone="warning" />{" "}
                {res.asset ? (
                  <Link href={`/assets/${res.asset.id}`} className="font-mono hover:underline">
                    {res.asset.assetTag}
                  </Link>
                ) : (
                  <span>{res.quantity} unit(s)</span>
                )}{" "}
                <span className="text-neutral-500">· {res.warehouse.name}</span>
              </span>
              <span className="flex gap-2">
                {canRelease && (
                  <Button variant="ghost" size="sm" onClick={() => onRelease({ id: res.id, label: res.asset?.assetTag ?? `${res.quantity} unit(s)` })}>
                    Release
                  </Button>
                )}
                {res.asset && canAssign && (
                  <Button size="sm" onClick={() => onAssign(res.asset!)}>
                    Issue to employee
                  </Button>
                )}
                {!res.asset && canIssue && (
                  <Button size="sm" loading={busy === `issue-${res.id}`} onClick={() => onIssue(res.id)}>
                    Issue stock
                  </Button>
                )}
              </span>
            </li>
          ))}
          {item.assignments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-neutral-50 px-3 py-2 text-body-sm">
              <span>
                <StatusBadge status={a.isActive ? "Assigned" : "Returned"} />{" "}
                <span className="font-mono">{a.asset.assetTag}</span>
                {a.asset.model && <span className="text-neutral-500"> · {a.asset.model}</span>}
                <span className="text-neutral-500"> · issued {formatDate(a.assignedAt)}</span>
              </span>
              {a.acknowledgedAt ? (
                <span className="text-caption text-green-700">Acknowledged {formatDate(a.acknowledgedAt)}</span>
              ) : isOwner && a.isActive ? (
                <Button size="sm" loading={busy === `ack-${a.id}`} onClick={() => onAcknowledge(a.id)}>
                  I received this
                </Button>
              ) : (
                <span className="text-caption text-amber-700">Awaiting acknowledgement</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
