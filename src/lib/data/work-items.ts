import type { z } from "zod";
import { sql } from "@/lib/db/client";
import { notFound } from "@/lib/errors";
import { workItemUpdateInput } from "@/lib/api/schemas";
import { listRequestsForWorkItems, type WorkItemRequest } from "@/lib/data/client-requests";
import { defaultClientVisible } from "@/lib/db/types";
import type {
  DateString,
  MilestoneStatus,
  Timestamp,
  WorkItem,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
} from "@/lib/db/types";

/**
 * The work-item data module.
 *
 * Every read and every write for the work-items surface goes through here, and
 * every function takes the project id it is scoped to as its first argument.
 * That is not decoration: it is what makes the rules below enforceable in one
 * place rather than remembered in four route handlers.
 *
 *   1. An id that arrives in a request is never trusted to be in the project
 *      being operated on. `requireWorkItemInProject` re-reads the row with both
 *      ids in the predicate, so a cross-project id is indistinguishable from a
 *      missing one -- it returns 404 and never leaks the row's existence.
 *   2. `completed_at` is derived by `work_items_sync_completed_at`. No statement
 *      in this file writes that column.
 */

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** A work item with the joins the board, list and detail panel all need. */
export interface WorkItemRow extends WorkItem {
  milestone_name: string | null;
  hours_worked: number;
  hours_billed: number;
  time_entry_count: number;
  note_count: number;
}

export interface MilestoneOption {
  id: string;
  name: string;
  status: MilestoneStatus;
  client_visible: boolean;
  target_date: DateString | null;
}

/** Progress notes attached to a specific item, for the detail panel. */
export interface WorkItemNote {
  id: string;
  work_item_id: string;
  body: string;
  approved_at: Timestamp | null;
  created_at: Timestamp;
}

async function requireProject(projectId: string): Promise<void> {
  const [row] = await sql`select 1 from projects where id = ${projectId} and archived_at is null`;
  if (!row) throw notFound("That project does not exist");
}

/**
 * The cross-project guard. Both ids are in the predicate, so an id belonging to
 * another project is simply not found -- the caller cannot tell the difference
 * between "wrong project" and "no such item", which is the point.
 */
export async function requireWorkItemInProject(
  projectId: string,
  id: string,
): Promise<WorkItem> {
  const [row] = await sql<WorkItem[]>`
    select * from work_items where id = ${id} and project_id = ${projectId}
  `;
  if (!row) throw notFound("That work item does not exist");
  return row;
}

/** Same rule for milestones: a milestone from another project is a 404. */
export async function requireMilestoneInProject(
  projectId: string,
  milestoneId: string,
): Promise<MilestoneOption> {
  const [row] = await sql<MilestoneOption[]>`
    select id, name, status, client_visible, target_date
    from milestones where id = ${milestoneId} and project_id = ${projectId}
  `;
  if (!row) throw notFound("That milestone does not exist on this project");
  return row;
}

async function requireAllInProject(projectId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await sql<{ id: string }[]>`
    select id from work_items where project_id = ${projectId} and id = any(${ids}::uuid[])
  `;
  if (found.length !== new Set(ids).size) {
    throw notFound("One or more of those work items does not exist");
  }
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

const SELECT_ROWS = sql`
  select w.*,
         m.name as milestone_name,
         coalesce(t.worked, 0) as hours_worked,
         coalesce(t.billed, 0) as hours_billed,
         coalesce(t.entries, 0)::int as time_entry_count,
         coalesce(n.notes, 0)::int as note_count
  from work_items w
  left join milestones m on m.id = w.milestone_id
  left join lateral (
    select sum(te.hours_worked) as worked,
           sum(te.hours_billed) as billed,
           count(*) as entries
    from time_entries te where te.work_item_id = w.id
  ) t on true
  left join lateral (
    select count(*) as notes
    from progress_notes pn where pn.work_item_id = w.id
  ) n on true
`;

export async function listWorkItems(projectId: string): Promise<WorkItemRow[]> {
  return sql<WorkItemRow[]>`
    ${SELECT_ROWS}
    where w.project_id = ${projectId}
    order by w.sort_order asc, w.created_at asc
  `;
}

/** One row, re-read after a write so the caller always gets the joined shape. */
export async function getWorkItemRow(
  projectId: string,
  id: string,
): Promise<WorkItemRow> {
  const [row] = await sql<WorkItemRow[]>`
    ${SELECT_ROWS} where w.id = ${id} and w.project_id = ${projectId}
  `;
  if (!row) throw notFound("That work item does not exist");
  return row;
}

export async function listProjectMilestones(projectId: string): Promise<MilestoneOption[]> {
  return sql<MilestoneOption[]>`
    select id, name, status, client_visible, target_date
    from milestones
    where project_id = ${projectId}
    order by sort_order asc, name asc
  `;
}

/** Progress notes that hang off an item, keyed by item id for the detail panel. */
export async function listWorkItemNotes(
  projectId: string,
): Promise<Record<string, WorkItemNote[]>> {
  const rows = await sql<WorkItemNote[]>`
    select id, work_item_id, body, approved_at, created_at
    from progress_notes
    where project_id = ${projectId} and work_item_id is not null
    order by created_at desc
  `;
  const byItem: Record<string, WorkItemNote[]> = {};
  for (const row of rows) {
    (byItem[row.work_item_id] ??= []).push(row);
  }
  return byItem;
}

export interface WorkItemsPageData {
  items: WorkItemRow[];
  milestones: MilestoneOption[];
  notes: Record<string, WorkItemNote[]>;
  requests: WorkItemRequest[];
}

export async function getWorkItemsPageData(projectId: string): Promise<WorkItemsPageData> {
  const [items, milestones, notes, requests] = await Promise.all([
    listWorkItems(projectId),
    listProjectMilestones(projectId),
    listWorkItemNotes(projectId),
    listRequestsForWorkItems(projectId),
  ]);
  return { items, milestones, notes, requests };
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export interface CreateWorkItemInput {
  project_id: string;
  title: string;
  type: WorkItemType;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  description?: string | null;
  milestone_id?: string | null;
  client_visible?: boolean;
}

export async function createWorkItem(
  input: CreateWorkItemInput,
): Promise<WorkItemRow> {
  await requireProject(input.project_id);

  const status: WorkItemStatus = input.status ?? "backlog";

  if (input.milestone_id) {
    await requireMilestoneInProject(input.project_id, input.milestone_id);
  }

  // Features are client-visible unless still in the backlog; bugs and
  // chores are internal until someone says otherwise.
  const clientVisible = input.client_visible ?? defaultClientVisible(input.type, status);

  const [created] = await sql<{ id: string }[]>`
    insert into work_items (
      project_id, milestone_id, type, status, priority, title, description,
      client_visible, sort_order
    ) values (
      ${input.project_id},
      ${input.milestone_id ?? null},
      ${input.type},
      ${status},
      ${input.priority ?? "medium"},
      ${input.title},
      ${input.description ?? null},
      ${clientVisible},
      (select coalesce(max(sort_order), -1) + 1 from work_items
        where project_id = ${input.project_id} and status = ${status})
    )
    returning id
  `;
  return getWorkItemRow(input.project_id, created.id);
}

export type UpdateWorkItemPatch = z.infer<typeof workItemUpdateInput>;

export async function updateWorkItem(
  projectId: string,
  id: string,
  patch: UpdateWorkItemPatch,
): Promise<WorkItemRow> {
  await requireWorkItemInProject(projectId, id);

  if (patch.milestone_id) await requireMilestoneInProject(projectId, patch.milestone_id);

  // Only the schema's columns, whatever the caller spread in: `completed_at` is
  // derived by the work_items_completed_at trigger and never accepted from a
  // caller, and `project_id` is the scope, not a field.
  const updates = Object.fromEntries(
    Object.entries(patch).filter(([k, v]) => v !== undefined && k in workItemUpdateInput.shape),
  );

  if (Object.keys(updates).length > 0) {
    await sql`
      update work_items set ${sql(updates)}
      where id = ${id} and project_id = ${projectId}
    `;
  }
  return getWorkItemRow(projectId, id);
}

export async function deleteWorkItem(projectId: string, id: string): Promise<WorkItem> {
  const item = await requireWorkItemInProject(projectId, id);
  await sql`delete from work_items where id = ${id} and project_id = ${projectId}`;
  return item;
}

/* -------------------------------------------------------------------------- */
/* Bulk                                                                        */
/* -------------------------------------------------------------------------- */

export type BulkAction =
  | { op: "status"; status: WorkItemStatus }
  | { op: "priority"; priority: WorkItemPriority }
  | { op: "milestone"; milestone_id: string | null }
  | { op: "client_visible"; client_visible: boolean }
  | { op: "delete" };

export interface BulkResult {
  changed: string[];
}

export async function bulkUpdateWorkItems(
  projectId: string,
  ids: string[],
  action: BulkAction,
): Promise<BulkResult> {
  await requireProject(projectId);
  await requireAllInProject(projectId, ids);
  if (ids.length === 0) return { changed: [] };

  if (action.op === "delete") {
    const rows = await sql<{ id: string }[]>`
      delete from work_items
      where project_id = ${projectId} and id = any(${ids}::uuid[])
      returning id
    `;
    return { changed: rows.map((r) => r.id) };
  }
  if (action.op === "milestone" && action.milestone_id) {
    await requireMilestoneInProject(projectId, action.milestone_id);
  }

  // Narrowed per op, so a new op without a branch here fails typecheck.
  const [column, value] =
    action.op === "status" ? (["status", action.status] as const)
    : action.op === "priority" ? (["priority", action.priority] as const)
    : action.op === "milestone" ? (["milestone_id", action.milestone_id] as const)
    : (["client_visible", action.client_visible] as const);
  const rows = await sql<{ id: string }[]>`
    update work_items set ${sql(column)} = ${value}
    where project_id = ${projectId}
      and id = any(${ids}::uuid[])
      and ${sql(column)} is distinct from ${value}
    returning id
  `;
  return { changed: rows.map((r) => r.id) };
}

/**
 * Drag and drop. `orderedIds` is the destination column exactly as the user
 * left it, so the drop position persists rather than the card jumping to the
 * bottom. Rows whose sort_order is already correct are not touched, which keeps
 * `updated_at` -- and therefore the list's "Updated" column -- honest.
 */
export async function moveWorkItem(
  projectId: string,
  id: string,
  status: WorkItemStatus,
  orderedIds: string[],
): Promise<WorkItemRow> {
  await requireWorkItemInProject(projectId, id);
  await requireAllInProject(projectId, orderedIds);

  await sql.begin(async (tx) => {
    await tx`
      update work_items set status = ${status}
      where id = ${id} and project_id = ${projectId} and status is distinct from ${status}
    `;
    for (const [index, itemId] of orderedIds.entries()) {
      await tx`
        update work_items set sort_order = ${index}
        where id = ${itemId} and project_id = ${projectId}
          and sort_order is distinct from ${index}
      `;
    }
  });

  return getWorkItemRow(projectId, id);
}
