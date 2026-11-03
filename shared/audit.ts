import { execute, type Tx } from "./db";

const SENSITIVE_KEYS = /password|token|secret|hash/i;

function scrub(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value, (key, v) => {
    if (key && SENSITIVE_KEYS.test(key)) return "[redacted]";
    if (typeof v === "bigint") return v.toString();
    return v;
  });
}

export interface AuditEntry {
  actorUserId: number | null;
  action: string;
  entityType: string;
  entityId: string | number;
  before?: unknown;
  after?: unknown;
  correlationId?: string;
}

/** Write an audit record inside the caller's transaction. */
export async function audit(tx: Tx, entry: AuditEntry) {
  await execute(
    tx,
    `INSERT INTO dbo.audit_logs (actor_user_id, [action], entity_type, entity_id, before_json, after_json, correlation_id)
     VALUES (@actorUserId, @action, @entityType, @entityId, @beforeJson, @afterJson, @correlationId)`,
    {
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: String(entry.entityId),
      beforeJson: scrub(entry.before),
      afterJson: scrub(entry.after),
      correlationId: entry.correlationId ?? null,
    }
  );
}
