import { sql, type Db } from "@/lib/db/client";
import { appendAudit, userActor } from "@/lib/audit";
import { conflict, notFound } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import {
  defaultClientVisible,
  type ClientRequestStatus,
  type Timestamp,
  type WorkItemStatus,
} from "@/lib/db/types";

/**
 * The operator's side of client requests: the inbox, its counts, and the two
 * decisions. Portal reads and writes live in `portal.ts`, never here.
 */

export interface ClientRequestRow {
  id: string;
  project_id: string;
  project_name: string;
  project_slug: string;
  title: string;
  body: string;
  requester_name: string;
  status: ClientRequestStatus;
  decline_note: string | null;
  work_item_id: string | null;
  item_status: WorkItemStatus | null;
  decided_at: Timestamp | null;
  created_at: Timestamp;
  image_ids: string[];
}

const SELECT = sql`
  select r.id, r.project_id, p.name as project_name, p.slug as project_slug,
         r.title, r.body, r.requester_name, r.status, r.decline_note, r.work_item_id,
         w.status as item_status, r.decided_at, r.created_at,
         coalesce(
           (select array_agg(i.id order by i.created_at)
            from client_request_images i where i.request_id = r.id),
           '{}'
         ) as image_ids
  from client_requests r
  join projects p on p.id = r.project_id
  left join work_items w on w.id = r.work_item_id
`;

export async function listClientRequests(filter: {
  status: ClientRequestStatus;
  projectId?: string;
}): Promise<ClientRequestRow[]> {
  return sql<ClientRequestRow[]>`
    ${SELECT}
    where r.status = ${filter.status}
      ${filter.projectId ? sql`and r.project_id = ${filter.projectId}` : sql``}
    order by r.created_at desc
    limit 500
  `;
}

export async function getClientRequest(id: string): Promise<ClientRequestRow | null> {
  const [row] = await sql<ClientRequestRow[]>`${SELECT} where r.id = ${id}`;
  return row ?? null;
}

/** The sidebar badge: untriaged requests on projects that are still live. */
export async function countSubmittedRequests(): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from client_requests r
    join projects p on p.id = r.project_id
    where r.status = 'submitted' and p.archived_at is null
  `;
  if (!row) throw new Error("countSubmittedRequests: aggregate returned no row");
  return row.n;
}

/** The dashboard card: the newest untriaged requests, and how many there are in all. */
export async function listSubmittedRequests(
  limit = 6,
): Promise<{ items: ClientRequestRow[]; total: number }> {
  const [items, total] = await Promise.all([
    sql<ClientRequestRow[]>`
      ${SELECT}
      where r.status = 'submitted' and p.archived_at is null
      order by r.created_at desc
      limit ${limit}
    `,
    countSubmittedRequests(),
  ]);
  return { items, total };
}

type Actor = { userId: string; email: string };

interface LockedRequest {
  id: string;
  project_id: string;
  title: string;
  body: string;
  requester_name: string;
  status: ClientRequestStatus;
  created_on: string;
}

/** Locks the row for the decision, and refuses anything already decided. */
async function lockSubmitted(tx: Db, id: string): Promise<LockedRequest> {
  const [row] = await tx<LockedRequest[]>`
    select id, project_id, title, body, requester_name, status,
           created_at::date::text as created_on
    from client_requests where id = ${id}
    for update
  `;
  if (!row) throw notFound("That request no longer exists");
  if (row.status !== "submitted") {
    throw conflict("This request has already been decided", "already_decided");
  }
  return row;
}

/**
 * Accept: a backlog feature, internal until published, carrying the client's
 * words and who asked. Created and linked in one transaction with the request
 * row locked, so a double click cannot make two items.
 */
export async function acceptClientRequest(
  id: string,
  actor: Actor,
): Promise<{ workItemId: string }> {
  return sql.begin(async (tx) => {
    const request = await lockSubmitted(tx, id);
    const description =
      `${request.body}\n\nRequested by ${request.requester_name} via the client portal on ` +
      `${formatDate(request.created_on)}.`;
    const [item] = await tx<{ id: string }[]>`
      insert into work_items (project_id, type, status, priority, title, description,
                              client_visible, sort_order)
      values (
        ${request.project_id}, 'feature', 'backlog', 'medium', ${request.title}, ${description},
        ${defaultClientVisible("feature", "backlog")},
        (select coalesce(max(sort_order), -1) + 1 from work_items
          where project_id = ${request.project_id} and status = 'backlog')
      )
      returning id
    `;
    if (!item) throw new Error("acceptClientRequest: insert returned no row");
    await tx`
      update client_requests
      set status = 'accepted', work_item_id = ${item.id}, decided_at = now()
      where id = ${id}
    `;
    await appendAudit(
      {
        ...userActor(actor),
        projectId: request.project_id,
        action: "client_request.accept",
        entityType: "client_request",
        entityId: id,
        payload: { work_item_id: item.id },
      },
      tx,
    );
    return { workItemId: item.id };
  });
}

/** Decline, with an optional note the client sees. A blank note is no note. */
export async function declineClientRequest(
  id: string,
  note: string | null,
  actor: Actor,
): Promise<void> {
  const cleaned = note && note.trim() ? note.trim() : null;
  await sql.begin(async (tx) => {
    const request = await lockSubmitted(tx, id);
    await tx`
      update client_requests
      set status = 'declined', decline_note = ${cleaned}, decided_at = now()
      where id = ${id}
    `;
    await appendAudit(
      {
        ...userActor(actor),
        projectId: request.project_id,
        action: "client_request.decline",
        entityType: "client_request",
        entityId: id,
        payload: { has_note: cleaned !== null },
      },
      tx,
    );
  });
}

export interface WorkItemRequest {
  work_item_id: string;
  request_id: string;
  requester_name: string;
  created_at: Timestamp;
  image_ids: string[];
}

/** For the work-item detail panel: which items in this project came from a client. */
export async function listRequestsForWorkItems(projectId: string): Promise<WorkItemRequest[]> {
  return sql<WorkItemRequest[]>`
    select r.work_item_id, r.id as request_id, r.requester_name, r.created_at,
           coalesce(
             (select array_agg(i.id order by i.created_at)
              from client_request_images i where i.request_id = r.id),
             '{}'
           ) as image_ids
    from client_requests r
    where r.project_id = ${projectId} and r.work_item_id is not null
  `;
}
