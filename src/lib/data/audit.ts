import { sql } from "@/lib/db/client";
import type { ActorType, AuditLogEntry } from "@/lib/db/types";

export interface AuditRow extends AuditLogEntry {
  project_name: string | null;
  project_slug: string | null;
}

export interface AuditFilters {
  actorType?: ActorType;
  actorId?: string;
  projectId?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface AuditPage {
  rows: AuditRow[];
  total: number;
}

/**
 * The forensic view. Read-only by construction: the table refuses updates and
 * deletes at the database level, so there is no write path here to get wrong.
 */
export async function listAuditLog(filters: AuditFilters = {}): Promise<AuditPage> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const where = sql`
    where true
      ${filters.actorType ? sql`and a.actor_type = ${filters.actorType}` : sql``}
      ${filters.actorId ? sql`and a.actor_id = ${filters.actorId}` : sql``}
      ${filters.projectId ? sql`and a.project_id = ${filters.projectId}` : sql``}
      ${filters.action ? sql`and a.action = ${filters.action}` : sql``}
      ${filters.from ? sql`and a.created_at >= ${filters.from}::date` : sql``}
      ${filters.to ? sql`and a.created_at < (${filters.to}::date + interval '1 day')` : sql``}
  `;

  const rows = await sql<AuditRow[]>`
    select a.*, p.name as project_name, p.slug as project_slug
    from audit_log a
    left join projects p on p.id = a.project_id
    ${where}
    order by a.created_at desc
    limit ${limit} offset ${offset}
  `;

  const [count] = await sql<{ total: number }[]>`
    select count(*)::int as total from audit_log a ${where}
  `;

  return { rows, total: count.total };
}

/** Distinct action names, for the filter dropdown. */
export async function listAuditActions(): Promise<string[]> {
  const rows = await sql<{ action: string }[]>`
    select distinct action from audit_log order by action
  `;
  return rows.map((r) => r.action);
}

