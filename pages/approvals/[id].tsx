import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Textarea } from "@/components/common/FormField";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ApprovalTimeline } from "@/components/common/ApprovalTimeline";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { Alert, ErrorState } from "@/components/common/States";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { api, ApiClientError, formatDate, formatMoney, useApi } from "@/lib/client";
import { hasPermission } from "@/lib/permissions";

export const getServerSideProps = withPageAuth("request.approve");

interface Task {
  id: number;
  status: string;
  dueAt: string | null;
  actedAt: string | null;
  comments: string | null;
  stage: { name: string; stageOrder: number; workflow: { name: string; version: number } };
  request: {
    id: number;
    requestNumber: string;
    requestType: string;
    purpose: string;
    justification: string | null;
    priority: string;
    requiredDate: string | null;
    status: string;
    submittedAt: string | null;
    requester: { id: number; fullName: string; employeeCode: string; department: string | null; designation: string | null };
    items: {
      id: number;
      quantity: number;
      requestedSpecification: string;
      estimatedUnitPrice: string | null;
      category: { name: string };
      item: { code: string; name: string } | null;
    }[];
    history: { id: number; action: string; stageName: string | null; comments: string | null; createdAt: string; actor: { fullName: string } }[];
  };
}

type Action = "approve" | "reject" | "return";

export default function ApprovalDetailPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const id = Number(router.query.id);
  const { data: task, error, loading, reload } = useApi<Task>(router.isReady && !forbidden ? `/approvals/${id}` : null);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function act(action: Action) {
    if ((action === "reject" || action === "return") && !comments.trim()) {
      setActionError("Please add a comment explaining your decision.");
      return;
    }
    setBusy(action);
    setActionError(null);
    try {
      const r = await api(`/approvals/${id}/${action}`, { method: "POST", body: { comments: comments.trim() || undefined } });
      setDone(r.message);
      setComments("");
      await reload();
    } catch (e) {
      setActionError(e instanceof ApiClientError ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const req = task?.request;
  const total = req?.items.reduce((s, i) => s + i.quantity * Number(i.estimatedUnitPrice ?? 0), 0) ?? 0;
  const pending = task?.status === "Pending" && req?.status === "Pending Approval";

  return (
    <MainLayout user={user} title={req?.requestNumber ?? "Approval"} forbidden={forbidden}>
      <PageHeader
        title={req ? `Review ${req.requestNumber}` : "Approval"}
        subtitle={task && <span className="flex flex-wrap items-center gap-2"><StatusBadge status={task.status} /> {task.stage.name} · {task.stage.workflow.name} v{task.stage.workflow.version}</span>}
        breadcrumbs={[{ label: "Approvals", href: "/approvals" }, { label: req?.requestNumber ?? "…" }]}
      />
      {loading && !task && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {task && req && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="flex flex-col gap-6 xl:col-span-2">
            {done && <Alert tone="success">{done}</Alert>}
            <Card title="Request">
              <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="eyebrow">Requester</dt>
                  <dd className="mt-1">
                    {req.requester.fullName}
                    <span className="block text-body-sm text-neutral-500">
                      {req.requester.designation ?? req.requester.employeeCode}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Department</dt>
                  <dd className="mt-1">{req.requester.department ?? "—"}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Submitted</dt>
                  <dd className="mt-1">{formatDate(req.submittedAt, true)}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Type</dt>
                  <dd className="mt-1">{req.requestType}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Priority</dt>
                  <dd className="mt-1">{req.priority}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Needed by</dt>
                  <dd className="mt-1">{formatDate(req.requiredDate)}</dd>
                </div>
              </dl>
              <div className="mt-6">
                <p className="eyebrow">Purpose</p>
                <p className="mt-1">{req.purpose}</p>
              </div>
              {req.justification && (
                <div className="mt-4">
                  <p className="eyebrow">Business justification</p>
                  <p className="mt-1 whitespace-pre-line text-neutral-800">{req.justification}</p>
                </div>
              )}
              {(hasPermission(user, "request.view.all") || req.requester.id === user.id) && (
                <Link href={`/requests/${req.id}`} className="mt-4 inline-block text-body-sm font-semibold text-primary hover:underline">
                  Open full request
                </Link>
              )}
            </Card>

            <Card title="Requested items" padded={false}>
              <ul>
                {req.items.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 px-4 py-4 last:border-0 sm:px-6">
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {i.quantity} × {i.item?.name ?? i.category.name}
                      </span>
                      {i.item && (
                        <span className="block text-caption text-neutral-500">
                          <span className="font-mono">{i.item.code}</span> · {i.category.name}
                        </span>
                      )}
                      <span className="block whitespace-pre-line text-body-sm text-neutral-600">{i.requestedSpecification}</span>
                    </span>
                    <span className="text-body-sm text-neutral-600">
                      {i.estimatedUnitPrice ? `${formatMoney(Number(i.estimatedUnitPrice) * i.quantity)}` : "No estimate"}
                    </span>
                  </li>
                ))}
              </ul>
              {total > 0 && (
                <p className="border-t border-neutral-200 px-6 py-3 text-right text-body-sm">
                  Estimated total <span className="ml-2 font-bold">{formatMoney(total)}</span>
                </p>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            {pending && hasPermission(user, "approve.button") ? (
              <Card title="Your decision">
                <div className="flex flex-col gap-4">
                  {actionError && <Alert>{actionError}</Alert>}
                  <Textarea
                    label="Comments"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    helper="Required when rejecting or returning for changes."
                    rows={4}
                  />
                  <Button onClick={() => act("approve")} loading={busy === "approve"} disabled={!!busy} size="lg">
                    Approve
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={() => act("return")} loading={busy === "return"} disabled={!!busy}>
                      Return
                    </Button>
                    <Button variant="destructive" onClick={() => act("reject")} loading={busy === "reject"} disabled={!!busy}>
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card title="Decision">
                <p className="text-body-sm text-neutral-600">
                  {task.status === "Pending"
                    ? pending
                      ? "You don't have the approve action enabled. Ask your administrator."
                      : `This request is now "${req.status}".`
                    : `You ${task.status.toLowerCase()} this request on ${formatDate(task.actedAt, true)}.`}
                </p>
                {task.comments && <p className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-body-sm">{task.comments}</p>}
              </Card>
            )}
            <Card title="History">
              <ApprovalTimeline entries={req.history} />
            </Card>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
