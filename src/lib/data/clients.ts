import { sql } from "@/lib/db/client";
import type { Db } from "@/lib/db/client";
import type {
  BillingModel,
  Client,
  ClientContact,
  Currency,
  ProjectStatus,
  Timestamp,
} from "@/lib/db/types";

export interface ClientListRow extends Client {
  project_count: number;
  active_projects: number;
  open_items: number;
  last_activity: Timestamp | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
}

export async function listClients(includeArchived = false): Promise<ClientListRow[]> {
  return sql<ClientListRow[]>`
    select c.*,
      coalesce(p.total, 0)::int as project_count,
      coalesce(p.active, 0)::int as active_projects,
      coalesce(w.open_items, 0)::int as open_items,
      p.last_activity,
      pc.name  as primary_contact_name,
      pc.email as primary_contact_email
    from clients c
    left join lateral (
      select count(*) as total,
             count(*) filter (where status = 'active') as active,
             max(updated_at) as last_activity
      from projects where client_id = c.id
    ) p on true
    left join lateral (
      select count(*) as open_items
      from work_items w
      join projects pr on pr.id = w.project_id
      where pr.client_id = c.id
        and w.status in ('backlog','planned','in_progress')
    ) w on true
    left join client_contacts pc on pc.client_id = c.id and pc.is_primary
    where ${includeArchived} or c.archived_at is null
    order by c.archived_at nulls first, c.name
  `;
}

export async function getClient(id: string): Promise<Client | null> {
  const [client] = await sql<Client[]>`select * from clients where id = ${id}`;
  return client ?? null;
}

export interface ClientProjectRow {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  billing_model: BillingModel;
  currency: Currency;
  hourly_rate: number | null;
  retainer_amount: number | null;
  maintenance_monthly: number | null;
  open_items: number;
  hours_worked: number;
}

/** Projects for one client, with enough context to be a useful link list. */
export async function getClientProjects(clientId: string): Promise<ClientProjectRow[]> {
  return sql<ClientProjectRow[]>`
    select p.id, p.name, p.slug, p.status, p.billing_model, p.currency,
           p.hourly_rate, p.retainer_amount, p.maintenance_monthly,
           coalesce(w.open_items, 0)::int as open_items,
           coalesce(t.hours_worked, 0)::float8 as hours_worked
    from projects p
    left join lateral (
      select count(*) as open_items from work_items
      where project_id = p.id
        and status in ('backlog','planned','in_progress')
    ) w on true
    left join lateral (
      select sum(hours_worked) as hours_worked from time_entries where project_id = p.id
    ) t on true
    where p.client_id = ${clientId}
    order by
      case p.status when 'active' then 0 when 'paused' then 1 when 'completed' then 2 else 3 end,
      p.name
  `;
}

export interface ClientTotals {
  invoiced: number;
  outstanding: number;
  currency: Currency;
}

/** Money is per currency: a client billed in both USD and CAD gets two rows. */
export async function getClientTotals(clientId: string): Promise<ClientTotals[]> {
  return sql<ClientTotals[]>`
    select i.currency,
      coalesce(sum(i.total) filter (where i.status in ('sent','paid')), 0)::float8 as invoiced,
      coalesce(sum(i.total - i.deposit_applied) filter (where i.status = 'sent'), 0)::float8 as outstanding
    from invoices i
    join projects p on p.id = i.project_id
    where p.client_id = ${clientId} and i.status <> 'void'
    group by i.currency
    order by i.currency
  `;
}

export interface ContactInput {
  name: string;
  email: string | null;
  is_primary: boolean;
}

/** Primary first, then oldest first — the order the client form renders. */
export async function getClientContacts(clientId: string): Promise<ClientContact[]> {
  return sql<ClientContact[]>`
    select * from client_contacts
    where client_id = ${clientId}
    order by is_primary desc, created_at, id
  `;
}

export async function getPrimaryContact(clientId: string): Promise<ClientContact | null> {
  const [contact] = await sql<ClientContact[]>`
    select * from client_contacts where client_id = ${clientId} and is_primary
  `;
  return contact ?? null;
}

/**
 * Replaces a client's contact set wholesale. Diffing would need stable ids
 * round-tripped through the form for no behavioural gain; the set is small and
 * the delete-then-insert runs in one transaction, so no reader sees a gap.
 */
export async function replaceClientContacts(
  clientId: string,
  contacts: ContactInput[],
  tx?: Db,
): Promise<ClientContact[]> {
  const run = async (db: Db) => {
    await db`delete from client_contacts where client_id = ${clientId}`;
    if (contacts.length === 0) return [];
    // Same canonical order as getClientContacts, so callers see one contract
    // regardless of whether the contact set was just replaced or merely read.
    return db<ClientContact[]>`
      with inserted as (
        insert into client_contacts ${db(
          contacts.map((c) => ({
            client_id: clientId,
            name: c.name,
            email: c.email,
            is_primary: c.is_primary,
          })),
        )}
        returning *
      )
      select * from inserted order by is_primary desc, created_at, id
    `;
  };
  // sql.begin's return type is postgres.js's UnwrapPromiseArray<T>, which for a
  // non-array-literal callback result collapses to unknown[] rather than T.
  return tx ? run(tx) : (sql.begin((t) => run(t)) as Promise<ClientContact[]>);
}
