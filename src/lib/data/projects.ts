import { sql } from "@/lib/db/client";
import { notFound } from "@/lib/errors";
import { endOfMonth, startOfMonth, today } from "@/lib/format";
import type {
  BillingModel,
  Currency,
  DateString,
  Milestone,
  ProjectStatus,
  SafeProject,
  Timestamp,
  WorkItemStatus,
  WorkItemType,
} from "@/lib/db/types";

/**
 * The project read model shared by every internal surface.
 *
 * `portal_password_hash` is never selected here, so no caller can leak it by
 * accident. Anything that needs to verify the portal password reads
 * the hash in the auth module, not from this file.
 */
export type ProjectWithClient = SafeProject & {
  client_name: string;
  client_contact_name: string | null;
  client_contact_email: string | null;
};

/**
 * Explicit column list rather than `p.*`. Adding a secret to `projects` should
 * not silently start returning it from every page in the app.
 */
const PROJECT_FIELDS = `
      p.id, p.client_id, p.name, p.slug, p.description, p.status, p.billing_model,
      p.currency, p.hourly_rate, p.retainer_amount, p.tax_rate,
      p.portal_password_version, p.payment_instructions, p.retainer_show_hours,
      p.build_fee, p.maintenance_monthly, p.maintenance_price_6, p.maintenance_price_12,
      p.maintenance_term_months, p.maintenance_starts_on,
      p.repo_url, p.started_at, p.archived_at, p.created_at, p.updated_at,
      c.name as client_name,
      pc.name  as client_contact_name,
      pc.email as client_contact_email`;

/** Lookup by the slug in the URL. Returns `null` so pages can call `notFound()`. */
export async function getProjectBySlug(slug: string): Promise<ProjectWithClient | null> {
  const [project] = await sql<ProjectWithClient[]>`
    select ${sql.unsafe(PROJECT_FIELDS)}
    from projects p
    join clients c on c.id = p.client_id
    left join client_contacts pc on pc.client_id = c.id and pc.is_primary
    where p.slug = ${slug}
  `;
  return project ?? null;
}

/** 404s a project id from a request that matches no row, archived or not. */
export async function assertProjectExists(id: string): Promise<void> {
  const [project] = await sql<{ id: string }[]>`select id from projects where id = ${id}`;
  if (!project) throw notFound("That project no longer exists");
}

export async function getProjectById(id: string): Promise<ProjectWithClient | null> {
  const [project] = await sql<ProjectWithClient[]>`
    select ${sql.unsafe(PROJECT_FIELDS)}
    from projects p
    join clients c on c.id = p.client_id
    left join client_contacts pc on pc.client_id = c.id and pc.is_primary
    where p.id = ${id}
  `;
  return project ?? null;
}

/* -------------------------------------------------------------------------- */
/* List                                                                        */
/* -------------------------------------------------------------------------- */

export interface ProjectListRow {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  billing_model: BillingModel;
  currency: Currency;
  hourly_rate: number | null;
  retainer_amount: number | null;
  maintenance_monthly: number | null;
  archived_at: Timestamp | null;
  client_id: string;
  client_name: string;
  open_items: number;
  hours_worked: number;
  hours_billed: number;
  last_activity: Timestamp | null;
}

export interface ProjectListPeriod {
  start: DateString;
  end: DateString;
}

/** The current calendar month — "this period" for both billing models. */
export function currentPeriod(): ProjectListPeriod {
  const now = today();
  return { start: startOfMonth(now), end: endOfMonth(now) };
}

export async function listProjects(): Promise<ProjectListRow[]> {
  const { start, end } = currentPeriod();
  return sql<ProjectListRow[]>`
    select
      p.id, p.name, p.slug, p.status, p.billing_model, p.currency,
      p.hourly_rate, p.retainer_amount, p.maintenance_monthly, p.archived_at,
      c.id as client_id, c.name as client_name,
      coalesce(w.open_items, 0)::int as open_items,
      coalesce(t.hours_worked, 0)::float8 as hours_worked,
      coalesce(t.hours_billed, 0)::float8 as hours_billed,
      greatest(p.updated_at, coalesce(n.last_note, p.created_at)) as last_activity
    from projects p
    join clients c on c.id = p.client_id
    left join lateral (
      select
        count(*) filter (where status in ('backlog','planned','in_progress')) as open_items
      from work_items where project_id = p.id
    ) w on true
    left join lateral (
      select sum(hours_worked) as hours_worked, sum(hours_billed) as hours_billed
      from time_entries
      where project_id = p.id and date between ${start} and ${end}
    ) t on true
    left join lateral (
      select max(created_at) as last_note from progress_notes where project_id = p.id
    ) n on true
    order by
      case p.status when 'active' then 0 when 'paused' then 1 when 'completed' then 2 else 3 end,
      p.name
  `;
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                    */
/* -------------------------------------------------------------------------- */

export interface ProjectStats {
  hours_worked_period: number;
  hours_billed_period: number;
  hours_worked_total: number;
  hours_billed_total: number;
  unbilled_hours: number;
  unbilled_amount: number;
  items_total: number;
  items_open: number;
  items_done: number;
  invoices_outstanding: number;
  outstanding_total: number;
}

export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  const { start, end } = currentPeriod();
  const [row] = await sql<ProjectStats[]>`
    select
      coalesce((select sum(hours_worked) from time_entries
        where project_id = ${projectId} and date between ${start} and ${end}), 0)::float8 as hours_worked_period,
      coalesce((select sum(hours_billed) from time_entries
        where project_id = ${projectId} and date between ${start} and ${end}), 0)::float8 as hours_billed_period,
      coalesce((select sum(hours_worked) from time_entries where project_id = ${projectId}), 0)::float8 as hours_worked_total,
      coalesce((select sum(hours_billed) from time_entries where project_id = ${projectId}), 0)::float8 as hours_billed_total,
      coalesce((select sum(t.hours_billed) from time_entries t
        where t.project_id = ${projectId} and t.invoice_id is null), 0)::float8 as unbilled_hours,
      coalesce((select sum(t.hours_billed * coalesce(t.rate_override, p.hourly_rate, 0))
        from time_entries t, projects p
        where t.project_id = ${projectId} and p.id = ${projectId} and t.invoice_id is null), 0)::float8 as unbilled_amount,
      (select count(*) from work_items where project_id = ${projectId})::int as items_total,
      (select count(*) from work_items where project_id = ${projectId}
        and status in ('backlog','planned','in_progress'))::int as items_open,
      (select count(*) from work_items where project_id = ${projectId} and status = 'done')::int as items_done,
      (select count(*) from invoices where project_id = ${projectId}
        and status in ('draft','sent'))::int as invoices_outstanding,
      coalesce((select sum(total - deposit_applied) from invoices where project_id = ${projectId}
        and status = 'sent'), 0)::float8 as outstanding_total
  `;
  return row;
}

export interface ItemStatusCount {
  status: WorkItemStatus;
  count: number;
}

export async function getItemStatusCounts(projectId: string): Promise<ItemStatusCount[]> {
  return sql<ItemStatusCount[]>`
    select status, count(*)::int as count
    from work_items
    where project_id = ${projectId}
    group by status
  `;
}

export interface MilestoneWithProgress extends Milestone {
  items_total: number;
  items_done: number;
}

export async function listMilestones(projectId: string): Promise<MilestoneWithProgress[]> {
  return sql<MilestoneWithProgress[]>`
    select m.*,
      coalesce(w.total, 0)::int as items_total,
      coalesce(w.done, 0)::int as items_done
    from milestones m
    left join lateral (
      select count(*) as total, count(*) filter (where status = 'done') as done
      from work_items where milestone_id = m.id
    ) w on true
    where m.project_id = ${projectId}
    order by m.status, m.sort_order, m.target_date nulls last, m.created_at
  `;
}

export interface ActivityEntry {
  kind: "note" | "item";
  id: string;
  title: string;
  detail: string | null;
  status: WorkItemStatus | null;
  type: WorkItemType | null;
  approved: boolean;
  at: Timestamp;
}

/**
 * A merged feed of what actually moved: progress notes written and work items
 * that reached a terminal status. Richer than an audit dump and it reads in
 * the language of the project rather than the language of the API.
 */
export async function getRecentActivity(projectId: string, limit = 8): Promise<ActivityEntry[]> {
  return sql<ActivityEntry[]>`
    (
      select 'note'::text as kind, n.id, left(n.body, 180) as title, null::text as detail,
             null::work_item_status as status, null::work_item_type as type,
             (n.approved_at is not null) as approved, n.created_at as at
      from progress_notes n
      where n.project_id = ${projectId}
      order by n.created_at desc
      limit ${limit}
    )
    union all
    (
      select 'item'::text as kind, w.id, w.title, w.status::text as detail,
             w.status, w.type, true as approved,
             coalesce(w.completed_at, w.updated_at) as at
      from work_items w
      where w.project_id = ${projectId} and w.status = 'done'
      order by coalesce(w.completed_at, w.updated_at) desc
      limit ${limit}
    )
    order by at desc
    limit ${limit}
  `;
}

/* -------------------------------------------------------------------------- */
/* Form helpers                                                                */
/* -------------------------------------------------------------------------- */

export interface ClientOption {
  id: string;
  name: string;
}

export async function listClientOptions(): Promise<ClientOption[]> {
  return sql<ClientOption[]>`
    select id, name from clients where archived_at is null order by name
  `;
}
