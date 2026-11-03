// Pure maintenance rules (no database access — unit tested).
import { appConfig } from "../../shared/config/app.config";

export function slaDueAt(priority: string, from: Date = new Date()): Date {
  const hours = appConfig.maintenanceSlaHours[priority] ?? appConfig.maintenanceSlaHours.Normal;
  return new Date(from.getTime() + hours * 3_600_000);
}

/** Breached when unresolved past the due time, or resolved after it. */
export function slaBreached(due: Date, resolvedAt: Date | null, now: Date = new Date()): boolean {
  return (resolvedAt ?? now).getTime() > due.getTime();
}
