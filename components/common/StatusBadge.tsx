import { statusTone, type StatusTone } from "@/shared/config/status.config";

const tones: Record<StatusTone, string> = {
  success: "bg-[#DCFCE7] text-[#166534]",
  warning: "bg-[#FEF9C3] text-[#854D0E]",
  error: "bg-[#FEE2E2] text-[#991B1B]",
  info: "bg-blue-100 text-blue-800",
  neutral: "bg-neutral-100 text-neutral-700",
};

export function StatusBadge({ status, tone }: { status: string; tone?: StatusTone }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption ${tones[tone ?? statusTone(status)]}`}
    >
      {status}
    </span>
  );
}
