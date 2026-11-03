import { describe, expect, it } from "vitest";
import {
  estimateRequestAmount,
  isStageGroupComplete,
  nextStageOrder,
  selectWorkflow,
  workflowMatches,
  type WorkflowCandidate,
} from "../../modules/approvals/approvals.rules";

const wf = (over: Partial<WorkflowCandidate>): WorkflowCandidate => ({
  id: 1,
  workflowKey: "std",
  version: 1,
  requestType: null,
  department: null,
  minAmount: null,
  maxAmount: null,
  priority: 0,
  isActive: true,
  ...over,
});

const ctx = { requestType: "New Joiner", department: "Design", amount: 100_000 };

describe("workflowMatches", () => {
  it("matches a generic workflow", () => expect(workflowMatches(wf({}), ctx)).toBe(true));
  it("rejects inactive", () => expect(workflowMatches(wf({ isActive: false }), ctx)).toBe(false));
  it("filters by request type", () => {
    expect(workflowMatches(wf({ requestType: "Replacement" }), ctx)).toBe(false);
    expect(workflowMatches(wf({ requestType: "New Joiner" }), ctx)).toBe(true);
  });
  it("filters by department", () => expect(workflowMatches(wf({ department: "IT" }), ctx)).toBe(false));
  it("applies inclusive amount bands", () => {
    expect(workflowMatches(wf({ minAmount: 100_000 }), ctx)).toBe(true);
    expect(workflowMatches(wf({ minAmount: 100_001 }), ctx)).toBe(false);
    expect(workflowMatches(wf({ maxAmount: 100_000 }), ctx)).toBe(true);
    expect(workflowMatches(wf({ maxAmount: 99_999 }), ctx)).toBe(false);
  });
});

describe("selectWorkflow", () => {
  it("returns null when nothing matches", () => {
    expect(selectWorkflow([wf({ requestType: "Upgrade" })], ctx)).toBeNull();
  });
  it("prefers higher priority", () => {
    const a = wf({ id: 1, workflowKey: "a", priority: 0 });
    const b = wf({ id: 2, workflowKey: "b", priority: 10, minAmount: 50_000 });
    expect(selectWorkflow([a, b], ctx)?.id).toBe(2);
  });
  it("prefers more specific at equal priority", () => {
    const generic = wf({ id: 1, workflowKey: "a" });
    const specific = wf({ id: 2, workflowKey: "b", department: "Design" });
    expect(selectWorkflow([generic, specific], ctx)?.id).toBe(2);
  });
  it("only considers the latest version of a key", () => {
    const v1 = wf({ id: 1, version: 1, priority: 100 });
    const v2 = wf({ id: 2, version: 2, priority: 0 });
    expect(selectWorkflow([v1, v2], ctx)?.id).toBe(2);
  });
  it("ignores inactive versions entirely", () => {
    const v1 = wf({ id: 1, version: 1 });
    const v2 = wf({ id: 2, version: 2, isActive: false });
    expect(selectWorkflow([v1, v2], ctx)?.id).toBe(1);
  });
});

describe("stage progression", () => {
  const stages = [{ stageOrder: 1 }, { stageOrder: 2 }, { stageOrder: 2 }, { stageOrder: 5 }];
  it("finds first and next orders", () => {
    expect(nextStageOrder(stages, null)).toBe(1);
    expect(nextStageOrder(stages, 1)).toBe(2);
    expect(nextStageOrder(stages, 2)).toBe(5);
    expect(nextStageOrder(stages, 5)).toBeNull();
    expect(nextStageOrder([], null)).toBeNull();
  });
  it("requires every parallel stage to approve", () => {
    const tasks = [
      { stageId: 10, status: "Approved" },
      { stageId: 11, status: "Pending" },
    ];
    expect(isStageGroupComplete([10, 11], tasks)).toBe(false);
    expect(isStageGroupComplete([10, 11], [...tasks, { stageId: 11, status: "Approved" }])).toBe(true);
  });
});

describe("estimateRequestAmount", () => {
  it("sums quantity × unit price, treating missing prices as 0", () => {
    expect(
      estimateRequestAmount([
        { quantity: 2, estimatedUnitPrice: 30_000 },
        { quantity: 1, estimatedUnitPrice: null },
      ])
    ).toBe(60_000);
  });
});
