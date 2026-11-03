import { formatDate } from "@/shared/client";
import { statusTone } from "@/shared/config/status.config";

export interface TimelineEntry {
  id: number;
  action: string;
  stageName?: string | null;
  comments?: string | null;
  createdAt: string;
  actor: { fullName: string };
}

const dot: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
  neutral: "bg-neutral-400",
};

export function ApprovalTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return <p className="text-body-sm text-neutral-500">No activity yet.</p>;
  return (
    <ol className="relative ml-2 border-l-2 border-neutral-200">
      {entries.map((e) => (
        <li key={e.id} className="mb-5 ml-5 last:mb-0">
          <span
            className={`absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full ring-4 ring-white ${dot[statusTone(e.action)]}`}
            aria-hidden="true"
          />
          <p className="text-body-sm font-semibold text-neutral-900">
            {e.action}
            {e.stageName && <span className="font-normal text-neutral-500"> · {e.stageName}</span>}
          </p>
          <p className="text-caption font-normal text-neutral-500">
            {e.actor.fullName} · {formatDate(e.createdAt, true)}
          </p>
          {e.comments && (
            <p className="mt-1.5 rounded-md bg-neutral-50 px-3 py-2 text-body-sm text-neutral-700">{e.comments}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
