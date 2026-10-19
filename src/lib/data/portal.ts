import { randomUUID } from "node:crypto";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sql, type Db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { appendAudit } from "@/lib/audit";
import { tooManyRequests } from "@/lib/errors";
import { PORTAL_COOKIE } from "@/lib/auth/portal-session";
import { invoicePdfPath, requestImagePath, storage } from "@/lib/storage";
import { clientRequestStatus, type ClientFacingStatus } from "@/lib/requests/status";
import { DAILY_REQUEST_LIMIT, type ImageKind } from "@/lib/requests/images";
import type {
  BillingModel,
  ClientRequestStatus,
  Currency,
  DateString,
  InvoiceStatus,
  MilestoneStatus,
  ProjectStatus,
  Timestamp,
  WorkItemStatus,
  WorkItemType,
} from "@/lib/db/types";

/**
 * The portal data module.
 *
 * Kraken's portal has no per-user identity, so Postgres RLS cannot express its
 * isolation rule. That rule lives here instead, and only here:
 *
 *   1. Every query in this file filters by `scope.projectId`.
 *   2. A `PortalScope` is branded and cannot be constructed by a caller. The
 *      only two producers both verify a signed cookie against the live project
 *      row, so a project id can never originate in a URL, a form field, or a
 *      JSON body.
 *   3. Nothing else in the codebase queries on behalf of the portal.
 *
 * The portal is read-only with one exception, `createPortalRequest` at the end
 * of this file: a client's feature request, written under the same scope rule.
 *
 * Anything returned from here is, by construction, safe to render to a client:
 * unapproved notes, `client_visible=false` rows, chores, rates, internal notes,
 * and unpublished invoices are all excluded at the SQL level rather than
 * filtered in a component.
 */

declare const scopeBrand: unique symbol;

export interface PortalScope {
  readonly projectId: string;
  readonly [scopeBrand]: true;
}

function brand(projectId: string): PortalScope {
  return { projectId } as PortalScope;
}

/**
 * Verifies a portal token and re-checks it against the live project row. The
 * cookie is a claim; the project must still exist, still be unarchived, and
 * still be on the password version the cookie was issued for.
 */
export async function portalScopeFromToken(token: string | undefined): Promise<PortalScope | null> {
  if (!token) return null;
  let projectId: string;
  let passwordVersion: number;
  try {
    const { payload } = await jwtVerify(token, env.sessionSecret, {
      issuer: "kraken",
      audience: "kraken-portal",
    });
    if (typeof payload.sub !== "string" || typeof payload.pv !== "number") return null;
    projectId = payload.sub;
    passwordVersion = payload.pv;
  } catch {
    return null;
  }

  const [project] = await sql<{ portal_password_version: number }[]>`
    select portal_password_version
    from projects
    where id = ${projectId} and archived_at is null
  `;
  if (!project || project.portal_password_version !== passwordVersion) return null;
  return brand(projectId);
}

/** The scope for the current request, from the cookie and nothing else. */
export async function portalScope(): Promise<PortalScope | null> {
  return portalScopeFromToken((await cookies()).get(PORTAL_COOKIE)?.value);
}

/**
 * The same thing for a route handler that has a `Request` in hand. Still the
 * cookie and nothing else -- it is read out of the request's own `Cookie`
 * header rather than from `next/headers`, which makes the handler callable
 * (and therefore testable) outside a request context.
 */
export async function portalScopeFromRequest(request: Request): Promise<PortalScope | null> {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PORTAL_COOKIE}=`));
  if (!match) return null;
  return portalScopeFromToken(decodeURIComponent(match.slice(PORTAL_COOKIE.length + 1)));
}

/**
 * Portal preview. The internal app renders the real portal for a
 * project so the operator sees exactly what the client sees. The caller must have
 * already proved an internal session; this is the single deliberate, named
 * exception to "the cookie is the only source", and it is never reachable from
 * a portal route.
 */
export function portalScopeForInternalPreview(projectId: string): PortalScope {
  return brand(projectId);
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                    */
/* -------------------------------------------------------------------------- */

export interface PortalProject {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  billing_model: BillingModel;
  currency: Currency;
  started_at: DateString | null;
  client_name: string;
}

/** Note the explicit column list: no rate, no retainer amount, no password hash. */
export async function getPortalProject(scope: PortalScope): Promise<PortalProject | null> {
  const [row] = await sql<PortalProject[]>`
    select p.id, p.name, p.slug, p.description, p.status, p.billing_model,
           p.currency, p.started_at, c.name as client_name
    from projects p
    join clients c on c.id = p.client_id
    where p.id = ${scope.projectId} and p.archived_at is null
  `;
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/* Updates                                                                     */
/* -------------------------------------------------------------------------- */

export interface PortalUpdate {
  id: string;
  body: string;
  approved_at: Timestamp;
  created_at: Timestamp;
  work_item_title: string | null;
}

/** Approved notes only. A note with `approved_at is null` cannot appear. */
export async function getPortalUpdates(
  scope: PortalScope,
  limit = 50,
): Promise<PortalUpdate[]> {
  return sql<PortalUpdate[]>`
    select n.id, n.body, n.approved_at, n.created_at,
           case when w.client_visible then w.title else null end as work_item_title
    from progress_notes n
    left join work_items w on w.id = n.work_item_id and w.project_id = ${scope.projectId}
    where n.project_id = ${scope.projectId}
      and n.approved_at is not null
    order by n.created_at desc
    limit ${Math.min(Math.max(limit, 1), 200)}
  `;
}

/* -------------------------------------------------------------------------- */
/* Features and bugs                                                           */
/* -------------------------------------------------------------------------- */

export interface PortalWorkItem {
  id: string;
  title: string;
  description: string | null;
  type: WorkItemType;
  status: WorkItemStatus;
  completed_at: Timestamp | null;
  milestone_id: string | null;
  milestone_name: string | null;
  milestone_status: MilestoneStatus | null;
  milestone_target_date: DateString | null;
}

/**
 * `client_visible=true` only, and only the three statuses a client
 * is shown. `backlog` and `wont_do` never appear, so parked or abandoned
 * work cannot read as finished.
 *
 * Type is deliberately NOT a filter. Until 2026-09-05 this also required
 * `type in ('feature','bug')`, which silently overrode the operator's own
 * `client_visible` decision: ticking "show this to the client" on a chore did
 * nothing, and nothing on the board said why. One control, one meaning --
 * and it is safe as the only control because `work_items.client_visible`
 * defaults to false, so an item reaches a client only by a deliberate act.
 */
export async function getPortalWorkItems(scope: PortalScope): Promise<PortalWorkItem[]> {
  return sql<PortalWorkItem[]>`
    select w.id, w.title, w.description, w.type, w.status, w.completed_at,
           w.milestone_id,
           case when m.client_visible then m.name else null end as milestone_name,
           case when m.client_visible then m.status else null end as milestone_status,
           case when m.client_visible then m.target_date else null end as milestone_target_date
    from work_items w
    left join milestones m
      on m.id = w.milestone_id
     and m.project_id = ${scope.projectId}
     and m.client_visible
    where w.project_id = ${scope.projectId}
      and w.client_visible
      and w.status in ('planned','in_progress','done')
    order by
      case when m.client_visible then m.sort_order else 2147483647 end,
      m.target_date nulls last,
      case w.status when 'in_progress' then 0 when 'planned' then 1 else 2 end,
      w.sort_order,
      w.created_at
  `;
}



/* -------------------------------------------------------------------------- */
/* Hours                                                                       */
/* -------------------------------------------------------------------------- */

export interface PortalHours {
  current_period_hours: number;
  periods: {
    invoice_number: string;
    period_start: DateString;
    period_end: DateString;
    hours: number;
  }[];
}

/**
 * Hourly projects only, billed hours only. `hours_worked`
 * and the goodwill gap are internal; the client sees the discount on the
 * invoice, where it is explained, not as an unlabelled number here.
 */
export async function getPortalHours(scope: PortalScope): Promise<PortalHours | null> {
  const [project] = await sql<{ billing_model: BillingModel }[]>`
    select billing_model from projects where id = ${scope.projectId}
  `;
  if (project?.billing_model !== "hourly") return null;

  const [current] = await sql<{ hours: number }[]>`
    select coalesce(sum(hours_billed), 0)::numeric as hours
    from time_entries
    where project_id = ${scope.projectId} and invoice_id is null
  `;

  const periods = await sql<PortalHours["periods"]>`
    select i.number as invoice_number, i.period_start, i.period_end,
           coalesce(sum(t.hours_billed), 0)::numeric as hours
    from invoices i
    left join time_entries t on t.invoice_id = i.id
    where i.project_id = ${scope.projectId}
      and i.status in ('sent','paid')
      and i.published_at is not null
      and i.number is not null
    group by i.id, i.number, i.period_start, i.period_end
    order by i.period_start desc
  `;

  return { current_period_hours: Number(current?.hours ?? 0), periods };
}

/* -------------------------------------------------------------------------- */
/* Invoices                                                                    */
/* -------------------------------------------------------------------------- */

export interface PortalInvoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  period_start: DateString;
  period_end: DateString;
  currency: Currency;
  total: number;
  deposit_applied: number;
  published_at: Timestamp;
  paid_at: Timestamp | null;
  has_pdf: boolean;
}

/** Published invoices only, and void invoices never. */
export async function getPortalInvoices(scope: PortalScope): Promise<PortalInvoice[]> {
  return sql<PortalInvoice[]>`
    select id, number, status, period_start, period_end, currency, total, deposit_applied,
           published_at, paid_at, (pdf_path is not null) as has_pdf
    from invoices
    where project_id = ${scope.projectId}
      and published_at is not null
      and status in ('sent','paid')
      and number is not null
    order by period_start desc, number desc
  `;
}

/**
 * Resolves an invoice download. The invoice id arrives from the request, so it
 * is treated as untrusted: it is matched against the scope's project and the
 * published filter in the same statement. A wrong id is indistinguishable from
 * a missing one.
 */
export async function getPortalInvoiceDownloadUrl(
  scope: PortalScope,
  invoiceId: string,
): Promise<string | null> {
  const [invoice] = await sql<{ number: string; pdf_path: string | null }[]>`
    select number, pdf_path
    from invoices
    where id = ${invoiceId}
      and project_id = ${scope.projectId}
      and published_at is not null
      and status in ('sent','paid')
  `;
  if (!invoice?.number) return null;
  const objectPath = invoice.pdf_path ?? invoicePdfPath(scope.projectId, invoice.number);
  return storage().signedUrl(objectPath, 120);
}

/* -------------------------------------------------------------------------- */
/* Login side                                                                  */
/* -------------------------------------------------------------------------- */

export interface PortalLoginTarget {
  id: string;
  name: string;
  slug: string;
  client_name: string;
  portal_password_hash: string;
  portal_password_version: number;
}

/**
 * The one query keyed by slug rather than by scope: resolving which login form
 * to show. It returns no project data beyond the name, and the hash it returns
 * is consumed by the login route and never rendered.
 */
export async function findProjectForLogin(slug: string): Promise<PortalLoginTarget | null> {
  const [row] = await sql<PortalLoginTarget[]>`
    select p.id, p.name, p.slug, c.name as client_name,
           p.portal_password_hash, p.portal_password_version
    from projects p
    join clients c on c.id = p.client_id
    where p.slug = ${slug} and p.archived_at is null
  `;
  return row ?? null;
}

export async function recordPortalLoginAttempt(input: {
  projectId: string | null;
  slug: string;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
}): Promise<void> {
  await sql`
    insert into portal_login_attempts (project_id, slug, ip, user_agent, success)
    values (${input.projectId}, ${input.slug}, ${input.ip}::inet, ${input.userAgent}, ${input.success})
  `;
}

/** Failed logins from one IP for one slug inside the window lock that pair out. */
export const PORTAL_LOCKOUT = { failures: 10, windowMinutes: 15 } as const;

/**
 * Keyed by (slug, ip), not project: an unknown slug accumulates failures
 * exactly like a real one, so the lockout cannot reveal which portals exist.
 * A request with no IP is counted by slug alone.
 *
 * ponytail: full table scan of portal_login_attempts; its only index besides
 * the primary key is (project_id, created_at), which this query cannot use.
 * Fine at solo scale; add an index on (slug, ip, created_at) if it grows large.
 */
export async function countRecentPortalLoginFailures(input: {
  slug: string;
  ip: string | null;
}): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n
    from portal_login_attempts
    where slug = ${input.slug}
      and not success
      and created_at > now() - make_interval(mins => ${PORTAL_LOCKOUT.windowMinutes})
      ${input.ip === null ? sql`` : sql`and ip = ${input.ip}::inet`}
  `;
  if (!row) throw new Error("countRecentPortalLoginFailures: count returned no row");
  return row.n;
}

/* -------------------------------------------------------------------------- */
/* Requests                                                                    */
/* -------------------------------------------------------------------------- */

export interface PortalRequest {
  id: string;
  title: string;
  body: string;
  requester_name: string;
  created_at: Timestamp;
  status: ClientFacingStatus;
  decline_note: string | null;
  image_ids: string[];
}

/**
 * Every request for this project, newest first. The linked work item
 * contributes its status and nothing else: its title, description and id stay
 * internal even when the item is not client-visible.
 */
export async function getPortalRequests(scope: PortalScope): Promise<PortalRequest[]> {
  const rows = await sql<
    (Omit<PortalRequest, "status"> & {
      request_status: ClientRequestStatus;
      item_status: WorkItemStatus | null;
    })[]
  >`
    select r.id, r.title, r.body, r.requester_name, r.created_at, r.decline_note,
           r.status as request_status, w.status as item_status,
           coalesce(
             (select array_agg(i.id order by i.created_at)
              from client_request_images i where i.request_id = r.id),
             '{}'
           ) as image_ids
    from client_requests r
    left join work_items w on w.id = r.work_item_id
    where r.project_id = ${scope.projectId}
    order by r.created_at desc
  `;
  return rows.map(({ request_status, item_status, ...row }) => ({
    ...row,
    status: clientRequestStatus(request_status, item_status),
  }));
}

/** The image only if it belongs to a request in this scope's project. */
export async function getPortalRequestImage(
  scope: PortalScope,
  imageId: string,
): Promise<{ storage_path: string } | null> {
  const [row] = await sql<{ storage_path: string }[]>`
    select i.storage_path
    from client_request_images i
    join client_requests r on r.id = i.request_id
    where i.id = ${imageId} and r.project_id = ${scope.projectId}
  `;
  return row ?? null;
}

async function requestsInLastDay(db: Db, projectId: string): Promise<number> {
  const [row] = await db<{ n: number }[]>`
    select count(*)::int as n from client_requests
    where project_id = ${projectId} and created_at > now() - interval '24 hours'
  `;
  if (!row) throw new Error("requestsInLastDay: aggregate returned no row");
  return row.n;
}

const LIMIT_MESSAGE = `You've sent ${DAILY_REQUEST_LIMIT} requests in the last day — please try again tomorrow.`;

/**
 * The portal's one write. Images are uploaded first under ids minted here, then
 * the rows are written in one transaction that re-checks the daily limit under
 * the project's row lock -- so two simultaneous submissions cannot both take
 * the last slot on a multi-connection pool. (The test pool has one connection,
 * which serialises the race; the lock is what makes it hold in production.)
 * A failure after upload leaves orphaned objects in storage, which is
 * acceptable at this volume.
 */
export async function createPortalRequest(
  scope: PortalScope,
  input: { title: string; body: string; requester_name: string },
  images: { bytes: Uint8Array; kind: ImageKind }[],
): Promise<{ id: string }> {
  if ((await requestsInLastDay(sql, scope.projectId)) >= DAILY_REQUEST_LIMIT) {
    throw tooManyRequests(LIMIT_MESSAGE);
  }

  const requestId = randomUUID();
  const stored: { id: string; path: string; contentType: string; size: number }[] = [];
  for (const image of images) {
    const id = randomUUID();
    const path = requestImagePath(scope.projectId, requestId, id, image.kind.ext);
    await storage().put(path, image.bytes, image.kind.contentType);
    stored.push({ id, path, contentType: image.kind.contentType, size: image.bytes.byteLength });
  }

  await sql.begin(async (tx) => {
    await tx`select id from projects where id = ${scope.projectId} for update`;
    if ((await requestsInLastDay(tx, scope.projectId)) >= DAILY_REQUEST_LIMIT) {
      throw tooManyRequests(LIMIT_MESSAGE);
    }
    await tx`
      insert into client_requests (id, project_id, title, body, requester_name)
      values (${requestId}, ${scope.projectId}, ${input.title}, ${input.body}, ${input.requester_name})
    `;
    for (const image of stored) {
      await tx`
        insert into client_request_images (id, request_id, storage_path, content_type, byte_size)
        values (${image.id}, ${requestId}, ${image.path}, ${image.contentType}, ${image.size})
      `;
    }
    await appendAudit(
      {
        actorType: "portal",
        actorId: scope.projectId,
        actorLabel: input.requester_name,
        projectId: scope.projectId,
        action: "client_request.create",
        entityType: "client_request",
        entityId: requestId,
        payload: { images: stored.length },
      },
      tx,
    );
  });

  return { id: requestId };
}
