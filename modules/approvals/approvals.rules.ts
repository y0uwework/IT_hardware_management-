// Pure workflow-selection and stage-progression rules (no database access — unit tested).

export interface WorkflowCandidate {
  id: number;
  workflowKey: string;
  version: number;
  requestType: string | null;
  department: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  priority: number;
  isActive: boolean;
}

export interface RequestContext {
  requestType: string;
  department: string | null;
  amount: number;
}

export function workflowMatches(wf: WorkflowCandidate, ctx: RequestContext): boolean {
  if (!wf.isActive) return false;
  if (wf.requestType && wf.requestType !== ctx.requestType) return false;
  if (wf.department && wf.department !== ctx.department) return false;
  if (wf.minAmount !== null && ctx.amount < wf.minAmount) return false;
  if (wf.maxAmount !== null && ctx.amount > wf.maxAmount) return false;
  return true;
}

/** Specificity: workflows that pin more conditions beat generic ones at equal priority. */
function specificity(wf: WorkflowCandidate): number {
  return (
    (wf.requestType ? 1 : 0) +
    (wf.department ? 1 : 0) +
    (wf.minAmount !== null ? 1 : 0) +
    (wf.maxAmount !== null ? 1 : 0)
  );
}

/**
 * Pick the workflow for a request: only the latest active version of each workflow key
 * is eligible; then highest priority, then most specific, then lowest id for stability.
 */
export function selectWorkflow<W extends WorkflowCandidate>(workflows: W[], ctx: RequestContext): W | null {
  const latestByKey = new Map<string, W>();
  for (const wf of workflows) {
    if (!wf.isActive) continue;
    const cur = latestByKey.get(wf.workflowKey);
    if (!cur || wf.version > cur.version) latestByKey.set(wf.workflowKey, wf);
  }
  const matching = Array.from(latestByKey.values()).filter((wf) => workflowMatches(wf, ctx));
  matching.sort(
    (a, b) => b.priority - a.priority || specificity(b) - specificity(a) || a.id - b.id
  );
  return matching[0] ?? null;
}

/** Distinct stage orders, ascending. Stages sharing an order run in parallel. */
export function stageOrders(stages: { stageOrder: number }[]): number[] {
  return Array.from(new Set(stages.map((s) => s.stageOrder))).sort((a, b) => a - b);
}

export function nextStageOrder(stages: { stageOrder: number }[], current: number | null): number | null {
  const orders = stageOrders(stages);
  if (current === null) return orders[0] ?? null;
  return orders.find((o) => o > current) ?? null;
}

/** A stage group is complete when every stage in it has at least one approved task. */
export function isStageGroupComplete(
  stageIdsInGroup: number[],
  tasks: { stageId: number; status: string }[],
  approvedStatus = "Approved"
): boolean {
  return stageIdsInGroup.every((sid) => tasks.some((t) => t.stageId === sid && t.status === approvedStatus));
}

/** Estimated request value used for amount-based workflow conditions. */
export function estimateRequestAmount(items: { quantity: number; estimatedUnitPrice: number | null }[]): number {
  return items.reduce((sum, i) => sum + i.quantity * (i.estimatedUnitPrice ?? 0), 0);
}
