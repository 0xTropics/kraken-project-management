import { sql } from "@/lib/db/client";
import { maintenanceRunCandidates } from "@/lib/data/maintenance";
import { currentPeriod } from "@/lib/data/projects";
import type {
  BillingModel,
  Currency,
  DateString,
  InvoiceStatus,
  ProjectStatus,
  Timestamp,
  WorkItemPriority,
  WorkItemType,
} from "@/lib/db/types";

/**
 * Everything the dashboard renders, in four independent queries so a slow
 * section cannot stall the rest.
 */

/* -------------------------------------------------------------------------- */
/* Hours this month                                                            */
/* -------------------------------------------------------------------------- */

export interface ProjectHoursRow {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  billing_model: BillingModel;
  currency: Currency;
  hourly_rate: number | null;
  retainer_amount: number | null;
  client_name: string;
  hours_worked: number;
  hours_billed: number;
  unbilled_hours: number;
  billed_value: number;
}

/**
 * Worked vs billed per active project for the current month. The gap between
 * the two is the number that reveals goodwill written off, so it is computed
 * here rather than left to the component.
 */
export async function getMonthHours(): Promise<ProjectHoursRow[]> {
  const { start, end } = currentPeriod();
  return sql<ProjectHoursRow[]>`
    select p.id, p.name, p.slug, p.status, p.billing_model, p.currency,
           p.hourly_rate, p.retainer_amount, c.name as client_name,
           coalesce(t.worked, 0)::float8 as hours_worked,
           coalesce(t.billed, 0)::float8 as hours_billed,
           coalesce(u.unbilled, 0)::float8 as unbilled_hours,
           coalesce(t.value, 0)::float8 as billed_value
    from projects p
    join clients c on c.id = p.client_id
    left join lateral (
      select sum(hours_worked) as worked,
             sum(hours_billed) as billed,
             sum(hours_billed * coalesce(rate_override, p.hourly_rate, 0)) as value
      from time_entries
      where project_id = p.id and date between ${start} and ${end}
    ) t on true
    left join lateral (
      select sum(hours_billed) as unbilled
      from time_entries
      where project_id = p.id and invoice_id is null
    ) u on true
    where p.status = 'active' and p.archived_at is null
    order by coalesce(t.worked, 0) desc, p.name
  `;
}

/* -------------------------------------------------------------------------- */
/* Open work by project                                                        */
/* -------------------------------------------------------------------------- */

export interface OpenWorkRow {
  id: string;
  name: string;
  slug: string;
  backlog: number;
  planned: number;
  in_progress: number;
  open_total: number;
}

export async function getOpenWorkByProject(): Promise<OpenWorkRow[]> {
  return sql<OpenWorkRow[]>`
    select p.id, p.name, p.slug,
      count(w.id) filter (where w.status = 'backlog')::int as backlog,
      count(w.id) filter (where w.status = 'planned')::int as planned,
      count(w.id) filter (where w.status = 'in_progress')::int as in_progress,
      count(w.id)::int as open_total
    from projects p
    join work_items w on w.project_id = p.id
      and w.status in ('backlog','planned','in_progress')
    where p.archived_at is null and p.status in ('active','paused')
    group by p.id
    order by count(w.id) filter (where w.status = 'in_progress') desc, count(w.id) desc, p.name
  `;
}

/* -------------------------------------------------------------------------- */
/* In progress                                                                 */
/* -------------------------------------------------------------------------- */

export interface InProgressItemRow {
  id: string;
  title: string;
  type: WorkItemType;
  priority: WorkItemPriority;
  updated_at: Timestamp;
  project_name: string;
  project_slug: string;
}

export interface InProgressItems {
  items: InProgressItemRow[];
  total: number;
}

/** What the operator is in the middle of, across every live project. */
export async function getInProgressItems(limit = 8): Promise<InProgressItems> {
  const rows = await sql<(InProgressItemRow & { total: number })[]>`
    select w.id, w.title, w.type, w.priority, w.updated_at,
           p.name as project_name, p.slug as project_slug,
           count(*) over ()::int as total
    from work_items w
    join projects p on p.id = w.project_id
    where w.status = 'in_progress' and p.archived_at is null
    order by case w.priority when 'high' then 0 when 'medium' then 1 else 2 end,
             w.updated_at desc
    limit ${limit}
  `;
  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
      priority: row.priority,
      updated_at: row.updated_at,
      project_name: row.project_name,
      project_slug: row.project_slug,
    })),
    total: rows[0]?.total ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Invoices needing attention                                                  */
/* -------------------------------------------------------------------------- */

export interface InvoiceAttentionRow {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  currency: Currency;
  total: number;
  period_start: DateString;
  period_end: DateString;
  sent_at: Timestamp | null;
  published_at: Timestamp | null;
  project_name: string;
  project_slug: string;
  client_name: string;
}

/** Drafts to finalize and sent invoices nobody has paid. */
export async function getInvoicesNeedingAttention(limit = 12): Promise<InvoiceAttentionRow[]> {
  return sql<InvoiceAttentionRow[]>`
    select i.id, i.number, i.status, i.currency, i.total, i.period_start, i.period_end,
           i.sent_at, i.published_at, p.name as project_name, p.slug as project_slug,
           c.name as client_name
    from invoices i
    join projects p on p.id = i.project_id
    join clients c on c.id = p.client_id
    where i.status in ('draft','sent')
    order by case i.status when 'sent' then 0 else 1 end, i.period_end desc
    limit ${limit}
  `;
}

/* -------------------------------------------------------------------------- */
/* Retainer run                                                                */
/* -------------------------------------------------------------------------- */

export interface RetainerRunPreview {
  eligible: number;
  already_invoiced: number;
  month: string;
}

/**
 * How many monthly invoices (retainers and monthly maintenance) still need
 * this month's draft. Drives the label on the one-click action.
 */
export async function getRetainerRunPreview(): Promise<RetainerRunPreview> {
  const { start, end } = currentPeriod();
  const [row] = await sql<{ eligible: number; already_invoiced: number }[]>`
    select
      count(*) filter (where inv.id is null)::int as eligible,
      count(*) filter (where inv.id is not null)::int as already_invoiced
    from projects p
    left join lateral (
      select i.id from invoices i
      where i.project_id = p.id and i.status <> 'void'
        and i.period_start = ${start} and i.period_end = ${end}
      limit 1
    ) inv on true
    where p.billing_model = 'retainer' and p.status = 'active' and p.archived_at is null
  `;
  if (!row) throw new Error("getRetainerRunPreview: aggregate returned no row");
  const maintenance = await maintenanceRunCandidates(start);
  return {
    eligible: row.eligible + maintenance.due.length,
    already_invoiced: row.already_invoiced + maintenance.current,
    month: start.slice(0, 7),
  };
}
