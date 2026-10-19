import { z } from "zod";
import { sql, type Db } from "@/lib/db/client";
import { appendAudit, userActor } from "@/lib/audit";
import { conflict, notFound } from "@/lib/errors";
import { dateString, money, optionalText, uuid } from "@/lib/api/schemas";
import type {
  BillingModel,
  Currency,
  DateString,
  InvoiceStatus,
  TimeEntry,
  WorkItemStatus,
} from "@/lib/db/types";

/**
 * Time entries.
 *
 * The one rule everything else hangs off: an entry with a non-null `invoice_id`
 * belongs to a finalized invoice and is history. The database enforces that with
 * a trigger (`time_entries_locked`), and this module refuses first so the user
 * gets a 409 that explains void-and-reissue rather than a bare guard message.
 */

/** The message the user sees when they try to edit history. */
export const LOCKED_MESSAGE =
  "This entry is on a finalized invoice and cannot be changed. Void that invoice and reissue it to correct the time.";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

export interface TimeEntryRow extends TimeEntry {
  project_slug: string;
  project_name: string;
  project_currency: Currency;
  project_billing_model: BillingModel;
  project_hourly_rate: number | null;
  client_name: string;
  work_item_title: string | null;
  invoice_number: string | null;
  invoice_status: InvoiceStatus | null;
}

const SELECT_ENTRIES = sql`
  select
    t.*,
    p.slug        as project_slug,
    p.name        as project_name,
    p.currency    as project_currency,
    p.billing_model as project_billing_model,
    p.hourly_rate as project_hourly_rate,
    c.name        as client_name,
    w.title       as work_item_title,
    i.number      as invoice_number,
    i.status      as invoice_status
  from time_entries t
  join projects p on p.id = t.project_id
  join clients  c on c.id = p.client_id
  left join work_items w on w.id = t.work_item_id
  left join invoices   i on i.id = t.invoice_id
`;

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export interface ListTimeEntriesOptions {
  from: string;
  to: string;
  /** Restrict to these project ids. Empty or omitted means every project. */
  projectIds?: string[];
}

/** Archived projects are hidden from the time views. */
export async function listTimeEntries(options: ListTimeEntriesOptions): Promise<TimeEntryRow[]> {
  const ids = options.projectIds ?? [];
  return sql<TimeEntryRow[]>`
    ${SELECT_ENTRIES}
    where t.date >= ${options.from}
      and t.date <= ${options.to}
      and p.archived_at is null
      ${ids.length ? sql`and t.project_id = any(${ids}::uuid[])` : sql``}
    order by t.date desc, p.name, t.created_at desc
  `;
}

export async function getTimeEntry(id: string): Promise<TimeEntryRow | null> {
  const [row] = await sql<TimeEntryRow[]>`${SELECT_ENTRIES} where t.id = ${id}`;
  return row ?? null;
}

export interface TimeProject {
  id: string;
  name: string;
  slug: string;
  client_name: string;
  billing_model: BillingModel;
  currency: Currency;
  hourly_rate: number | null;
}

/** Projects that can be filtered on, or logged against. Archived ones are excluded. */
export async function listTimeProjects(): Promise<TimeProject[]> {
  return sql<TimeProject[]>`
    select p.id, p.name, p.slug, c.name as client_name, p.billing_model,
           p.currency, p.hourly_rate
    from projects p
    join clients c on c.id = p.client_id
    where p.archived_at is null
    order by
      case p.status when 'active' then 0 when 'paused' then 1 when 'completed' then 2 else 3 end,
      p.name
  `;
}

export interface TimeFormWorkItem {
  id: string;
  project_id: string;
  title: string;
  status: WorkItemStatus;
}

export interface TimeFormOptions {
  projects: TimeProject[];
  workItems: TimeFormWorkItem[];
}

/**
 * Everything the entry form needs, in one round trip. The work-item list is
 * small enough to ship whole (a few hundred rows at most), which keeps the
 * project picker instant on a phone instead of firing a fetch per change.
 */
export async function getTimeFormOptions(): Promise<TimeFormOptions> {
  const [projects, workItems] = await Promise.all([
    listTimeProjects(),
    sql<TimeFormWorkItem[]>`
      select w.id, w.project_id, w.title, w.status
      from work_items w
      join projects p on p.id = w.project_id
      where p.archived_at is null and w.status <> 'wont_do'
      order by
        case w.status
          when 'in_progress' then 0 when 'planned' then 1
          when 'backlog' then 2 else 3 end,
        w.updated_at desc
      limit 500
    `,
  ]);
  return { projects, workItems };
}

/**
 * The newest entries overall, for the "just logged" list under the entry form.
 * Seeing the last few rows is what makes logging five entries in a row feel
 * safe -- you can tell at a glance that nothing went to the wrong project.
 */
export async function listRecentTimeEntries(limit = 6): Promise<TimeEntryRow[]> {
  return sql<TimeEntryRow[]>`
    ${SELECT_ENTRIES}
    where p.archived_at is null
    order by t.created_at desc
    limit ${limit}
  `;
}

export interface TimeContext {
  total_worked: number;
  total_billed: number;
  latest_date: DateString | null;
}

/**
 * All-time totals for a project (or the whole workspace). An empty period is
 * only confusing if you cannot see that time exists elsewhere, so the empty
 * state quotes these and offers to jump to `latest_date`.
 */
export async function getTimeContext(projectId?: string): Promise<TimeContext> {
  const [row] = await sql<TimeContext[]>`
    select
      coalesce(sum(t.hours_worked), 0)::float8 as total_worked,
      coalesce(sum(t.hours_billed), 0)::float8 as total_billed,
      max(t.date) as latest_date
    from time_entries t
    join projects p on p.id = t.project_id
    where p.archived_at is null
      ${projectId ? sql`and t.project_id = ${projectId}` : sql``}
  `;
  return row;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

const hours = z.coerce
  .number()
  .min(0, "Hours cannot be negative")
  .max(24, "A day holds 24 hours")
  .refine((v) => Math.round(v * 100) === v * 100, "Use at most two decimals");

/** The schemas for the flat `/api/internal/time-entries` collection this module serves. */
const timeEntryFields = z.object({
  date: dateString,
  hours_worked: hours.refine((v) => v > 0, "Log more than zero hours"),
  hours_billed: hours.optional(),
  description: optionalText(2000),
  work_item_id: uuid.nullable().optional(),
  rate_override: money.nullable().optional(),
  discount_reason: optionalText(500),
});

export const timeEntryCreateInput = z
  .object({ project_id: uuid, ...timeEntryFields.shape })
  .refine((v) => (v.hours_billed ?? v.hours_worked) <= v.hours_worked, {
    message: "Billed hours cannot exceed worked hours",
    path: ["hours_billed"],
  });

export const timeEntryUpdateInput = timeEntryFields.partial();

export type TimeEntryCreateInput = z.infer<typeof timeEntryCreateInput>;
export type TimeEntryUpdateInput = z.infer<typeof timeEntryUpdateInput>;

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A work item id from another project is a 404, not a 403 -- the
 * caller learns nothing about whether the id exists.
 */
async function assertWorkItemInProject(
  tx: Db,
  projectId: string,
  workItemId: string | null | undefined,
): Promise<void> {
  if (!workItemId) return;
  const [item] = await tx<{ id: string }[]>`
    select id from work_items where id = ${workItemId} and project_id = ${projectId}
  `;
  if (!item) throw notFound("That work item is not on this project");
}

export interface TimeActor {
  userId: string;
  email: string;
}

export async function createTimeEntry(
  input: TimeEntryCreateInput,
  actor: TimeActor,
): Promise<TimeEntryRow> {
  const id = await sql.begin(async (tx) => {
    const [project] = await tx<{ id: string }[]>`
      select id from projects where id = ${input.project_id} and archived_at is null
    `;
    if (!project) throw notFound("Project not found");
    await assertWorkItemInProject(tx, project.id, input.work_item_id);

    // hours_billed defaults to hours_worked. The check constraint and
    // the zod refine both cover billed > worked; this is the default half.
    const billed = input.hours_billed ?? input.hours_worked;

    const [row] = await tx<{ id: string }[]>`
      insert into time_entries (
        project_id, work_item_id, date, hours_worked, hours_billed,
        discount_reason, rate_override, description
      ) values (
        ${project.id},
        ${input.work_item_id ?? null},
        ${input.date},
        ${input.hours_worked},
        ${billed},
        ${input.discount_reason ?? null},
        ${input.rate_override ?? null},
        ${input.description ?? null}
      )
      returning id
    `;

    await appendAudit(
      {
        ...userActor(actor),
        projectId: project.id,
        action: "time_entry.create",
        entityType: "time_entry",
        entityId: row.id,
        payload: { ...input, hours_billed: billed },
      },
      tx,
    );
    return row.id;
  });

  const entry = await getTimeEntry(id);
  if (!entry) throw notFound("Time entry not found");
  return entry;
}

export async function updateTimeEntry(
  id: string,
  input: TimeEntryUpdateInput,
  actor: TimeActor,
): Promise<TimeEntryRow> {
  await sql.begin(async (tx) => {
    const [existing] = await tx<TimeEntry[]>`
      select * from time_entries where id = ${id} for update
    `;
    if (!existing) throw notFound("Time entry not found");
    // Refuse before the statement reaches the trigger, so the caller gets the
    // explanation rather than `time_entry_locked`.
    if (existing.invoice_id) throw conflict(LOCKED_MESSAGE, "time_entry_locked");

    if (input.work_item_id !== undefined) {
      await assertWorkItemInProject(tx, existing.project_id, input.work_item_id);
    }

    const worked = input.hours_worked ?? existing.hours_worked;
    // Raising worked hours alone must not silently raise what is billed, and
    // lowering worked hours must not leave billed above it.
    const billed = input.hours_billed ?? Math.min(existing.hours_billed, worked);
    if (billed > worked) {
      throw conflict("Billed hours cannot exceed worked hours", "billed_exceeds_worked");
    }

    const next = {
      date: input.date ?? existing.date,
      hours_worked: worked,
      hours_billed: billed,
      description: input.description === undefined ? existing.description : input.description,
      work_item_id:
        input.work_item_id === undefined ? existing.work_item_id : input.work_item_id,
      rate_override:
        input.rate_override === undefined ? existing.rate_override : input.rate_override,
      discount_reason:
        input.discount_reason === undefined ? existing.discount_reason : input.discount_reason,
    };

    await tx`update time_entries set ${tx(next)} where id = ${id}`;

    await appendAudit(
      {
        ...userActor(actor),
        projectId: existing.project_id,
        action: "time_entry.update",
        entityType: "time_entry",
        entityId: id,
        payload: { changes: input, applied: next },
      },
      tx,
    );
  });

  const entry = await getTimeEntry(id);
  if (!entry) throw notFound("Time entry not found");
  return entry;
}

export async function deleteTimeEntry(id: string, actor: TimeActor): Promise<void> {
  await sql.begin(async (tx) => {
    const [existing] = await tx<TimeEntry[]>`
      select * from time_entries where id = ${id} for update
    `;
    if (!existing) throw notFound("Time entry not found");
    if (existing.invoice_id) throw conflict(LOCKED_MESSAGE, "time_entry_locked");

    await tx`delete from time_entries where id = ${id}`;

    // The row is gone, so the audit payload is the only remaining record of it.
    await appendAudit(
      {
        ...userActor(actor),
        projectId: existing.project_id,
        action: "time_entry.delete",
        entityType: "time_entry",
        entityId: id,
        payload: {
          date: existing.date,
          hours_worked: existing.hours_worked,
          hours_billed: existing.hours_billed,
          description: existing.description,
          work_item_id: existing.work_item_id,
          rate_override: existing.rate_override,
          discount_reason: existing.discount_reason,
        },
      },
      tx,
    );
  });
}
