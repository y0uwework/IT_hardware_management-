// Shared acknowledgement UI. Every page that shows a handover uses these, so the
// "I received this" action, its messages and its statuses are identical across the app.
import { useState } from "react";
import { Button } from "@/components/common/Button";
import { toastSetter } from "@/components/common/Toast";
import { api, ApiClientError, formatDate } from "@/shared/client";
import type { HandoverKind } from "@/modules/handovers/handovers.types";

/** Call the single acknowledge endpoint for either kind of handover. */
export function acknowledgeHandover(kind: HandoverKind, id: number) {
  return api(`/handovers/${kind}/${id}/acknowledge`, { method: "POST" });
}

/**
 * Acknowledges a handover and then runs `onDone` (typically the page's `reload`), so every list
 * that shows the item — My assets, the request page, the dashboard — reflects it straight away.
 */
export function AcknowledgeButton({
  kind,
  id,
  onDone,
  size,
  className,
}: {
  kind: HandoverKind;
  id: number;
  onDone?: () => unknown;
  size?: "sm" | "md";
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const toast = toastSetter("error");

  async function run() {
    setBusy(true);
    try {
      await acknowledgeHandover(kind, id);
      toast({ tone: "success", text: "Thanks — receipt acknowledged." });
      await onDone?.();
    } catch (e) {
      toast({ tone: "error", text: e instanceof ApiClientError ? e.message : "Could not acknowledge" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size={size} className={className} loading={busy} onClick={run}>
      I received this
    </Button>
  );
}

/** Pill used on cards and in tables. */
export function AcknowledgementBadge({ acknowledgedAt }: { acknowledgedAt: string | null }) {
  return acknowledgedAt ? (
    <span className="rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-caption text-[#166534]">Acknowledged</span>
  ) : (
    <span className="rounded-full bg-[#FEF9C3] px-2.5 py-0.5 text-caption text-[#854D0E]">Action needed</span>
  );
}

/**
 * Inline status for list rows: "Acknowledged <date>", the acknowledge button for the recipient,
 * or "Awaiting acknowledgement" for everyone else.
 */
export function AcknowledgementStatus({
  kind,
  id,
  acknowledgedAt,
  canAcknowledge,
  onDone,
}: {
  kind: HandoverKind;
  id: number;
  acknowledgedAt: string | null;
  canAcknowledge: boolean;
  onDone?: () => unknown;
}) {
  if (acknowledgedAt) return <span className="text-caption text-green-700">Acknowledged {formatDate(acknowledgedAt)}</span>;
  if (canAcknowledge) return <AcknowledgeButton kind={kind} id={id} onDone={onDone} size="sm" />;
  return <span className="text-caption text-amber-700">Awaiting acknowledgement</span>;
}
