import { sql, type Db } from "@/lib/db/client";
import type { InternalSession } from "@/lib/auth/internal";
import type { ActorType } from "@/lib/db/types";

export interface AuditInput {
  actorType: ActorType;
  actorId?: string | null;
  actorLabel?: string | null;
  projectId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: unknown;
}

/** The actor fields for a row written on behalf of the signed-in operator. */
export function userActor(session: Pick<InternalSession, "userId" | "email">) {
  return { actorType: "user", actorId: session.userId, actorLabel: session.email } as const;
}

/** Keys that must never reach the audit log even if a caller passes them through. */
const REDACTED = new Set([
  "password",
  "portal_password",
  "portalPassword",
  "portal_password_hash",
  "token",
  "raw_token",
  "rawToken",
  "authorization",
  "secret",
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACTED.has(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

/**
 * Appends one row to the append-only audit log. The row is written *before*
 * the response is returned, so this is always awaited rather than fired and
 * forgotten.
 *
 * Pass `tx` to enrol the audit row in a caller's transaction.
 */
export async function appendAudit(input: AuditInput, tx: Db = sql): Promise<void> {
  const payload = redact(input.payload ?? {});
  await tx`
    insert into audit_log (actor_type, actor_id, actor_label, project_id, action, entity_type, entity_id, payload)
    values (
      ${input.actorType},
      ${input.actorId ?? null},
      ${input.actorLabel ?? null},
      ${input.projectId ?? null},
      ${input.action},
      ${input.entityType ?? null},
      ${input.entityId ?? null},
      ${tx.json(payload as never)}
    )
  `;
}
