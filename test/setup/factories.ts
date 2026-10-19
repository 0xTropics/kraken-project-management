import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { replaceClientContacts } from "@/lib/data/clients";
import type { ContactInput } from "@/lib/data/clients";
import type {
  BillingModel,
  ChargeKind,
  Client,
  ClientRequest,
  Currency,
  Milestone,
  Project,
  ProgressNote,
  ProjectCharge,
  TimeEntry,
  WorkItem,
  WorkItemStatus,
  WorkItemType,
} from "@/lib/db/types";

/** Wipes every table, in FK-safe order: between tests, and before `npm run db:seed`. */
export async function resetDatabase(): Promise<void> {
  await sql.unsafe(`
    truncate table
      client_request_images, client_requests,
      audit_log, portal_login_attempts, invoice_lines, time_entries,
      invoices, invoice_counters, progress_notes, project_notes, work_items,
      milestones, projects, clients, internal_users
    restart identity cascade
  `);
}

// contacts defaults to empty: callers that want a primary contact call
// replaceClientContacts (or invoiceWithContact-style helpers) themselves, and
// several client_contacts tests insert their own primary directly and expect
// none to exist yet, so an auto-created default contact here would collide
// with the one-primary-per-client unique index.
export async function createClient(
  overrides: Partial<Client> = {},
  contacts: ContactInput[] = [],
): Promise<Client> {
  const [row] = await sql<Client[]>`
    insert into clients (name, notes)
    values (
      ${overrides.name ?? `Client ${randomUUID().slice(0, 8)}`},
      ${overrides.notes ?? null}
    )
    returning *
  `;
  if (!row) throw new Error("createClient: insert returned no row");
  if (contacts.length > 0) await replaceClientContacts(row.id, contacts);
  return row;
}

export interface CreateProjectOptions extends Partial<Project> {
  portalPassword?: string;
}

export async function createProject(options: CreateProjectOptions = {}): Promise<Project> {
  const clientId = options.client_id ?? (await createClient()).id;
  const billing: BillingModel = options.billing_model ?? "hourly";
  const suffix = randomUUID().slice(0, 8);
  const [row] = await sql<Project[]>`
    insert into projects (
      client_id, name, slug, description, status, billing_model, currency,
      hourly_rate, retainer_amount, tax_rate, portal_password_hash,
      payment_instructions, retainer_show_hours, started_at,
      build_fee, maintenance_monthly, maintenance_price_6, maintenance_price_12,
      maintenance_term_months, maintenance_starts_on
    ) values (
      ${clientId},
      ${options.name ?? `Project ${suffix}`},
      ${options.slug ?? `project-${suffix}`},
      ${options.description ?? "A project description the client can read."},
      ${options.status ?? "active"},
      ${billing},
      ${(options.currency ?? "USD") as Currency},
      ${billing === "hourly" ? (options.hourly_rate ?? 150) : (options.hourly_rate ?? null)},
      ${billing === "retainer" ? (options.retainer_amount ?? 4000) : (options.retainer_amount ?? null)},
      ${options.tax_rate ?? 0},
      ${await hashPassword(options.portalPassword ?? "correct-horse-battery")},
      ${options.payment_instructions ?? "E-transfer to billing@example.com"},
      ${options.retainer_show_hours ?? false},
      ${options.started_at ?? "2026-01-06"},
      ${options.build_fee ?? null},
      ${billing === "maintenance" ? (options.maintenance_monthly ?? 150) : (options.maintenance_monthly ?? null)},
      ${options.maintenance_price_6 ?? null},
      ${options.maintenance_price_12 ?? null},
      ${options.maintenance_term_months ?? 1},
      ${options.maintenance_starts_on ?? null}
    )
    returning *
  `;
  return row;
}

export async function createMilestone(
  projectId: string,
  overrides: Partial<Milestone> = {},
): Promise<Milestone> {
  const [row] = await sql<Milestone[]>`
    insert into milestones (project_id, name, target_date, status, client_visible, sort_order)
    values (
      ${projectId},
      ${overrides.name ?? "Milestone"},
      ${overrides.target_date ?? null},
      ${overrides.status ?? "open"},
      ${overrides.client_visible ?? true},
      ${overrides.sort_order ?? 0}
    )
    returning *
  `;
  return row;
}

export async function createWorkItem(
  projectId: string,
  overrides: Partial<WorkItem> = {},
): Promise<WorkItem> {
  const type: WorkItemType = overrides.type ?? "feature";
  const status: WorkItemStatus = overrides.status ?? "planned";
  const [row] = await sql<WorkItem[]>`
    insert into work_items (
      project_id, milestone_id, type, status, priority, title, description,
      client_visible, sort_order
    ) values (
      ${projectId},
      ${overrides.milestone_id ?? null},
      ${type},
      ${status},
      ${overrides.priority ?? "medium"},
      ${overrides.title ?? "Work item"},
      ${overrides.description ?? null},
      ${overrides.client_visible ?? (type === "feature" && status !== "backlog")},
      ${overrides.sort_order ?? 0}
    )
    returning *
  `;
  return row;
}

export async function createProgressNote(
  projectId: string,
  overrides: Partial<ProgressNote> = {},
): Promise<ProgressNote> {
  const [row] = await sql<ProgressNote[]>`
    insert into progress_notes (project_id, work_item_id, body, approved_at)
    values (
      ${projectId},
      ${overrides.work_item_id ?? null},
      ${overrides.body ?? "Progress note body"},
      ${overrides.approved_at ?? null}
    )
    returning *
  `;
  return row;
}

export async function createTimeEntry(
  projectId: string,
  overrides: Partial<TimeEntry> = {},
): Promise<TimeEntry> {
  const worked = overrides.hours_worked ?? 3;
  const [row] = await sql<TimeEntry[]>`
    insert into time_entries (
      project_id, work_item_id, date, hours_worked, hours_billed,
      discount_reason, rate_override, description
    ) values (
      ${projectId},
      ${overrides.work_item_id ?? null},
      ${overrides.date ?? "2026-03-10"},
      ${worked},
      ${overrides.hours_billed ?? worked},
      ${overrides.discount_reason ?? null},
      ${overrides.rate_override ?? null},
      ${overrides.description ?? "Implementation work"}
    )
    returning *
  `;
  return row;
}

export async function createCharge(
  projectId: string,
  options: Partial<{
    kind: ChargeKind;
    description: string;
    amount: number;
    taxable: boolean;
    incurred_on: string;
    note: string | null;
  }> = {},
): Promise<ProjectCharge> {
  const [row] = await sql<ProjectCharge[]>`
    insert into project_charges ${sql({
      project_id: projectId,
      kind: options.kind ?? "expense",
      description: options.description ?? "Shipping and packaging",
      amount: options.amount ?? 38.4,
      taxable: options.taxable ?? true,
      incurred_on: options.incurred_on ?? "2026-03-15",
      note: options.note ?? null,
    })}
    returning *
  `;
  if (!row) throw new Error("createCharge: insert returned no row");
  return row;
}

export async function createInternalUser(
  email = "operator@example.com",
  password = "internal-password",
): Promise<{ id: string; email: string }> {
  const [row] = await sql<{ id: string; email: string }[]>`
    insert into internal_users (email, name, password_hash)
    values (${email}, ${"Morgan Hale"}, ${await hashPassword(password)})
    returning id, email
  `;
  return row;
}

export async function createClientRequest(
  projectId: string,
  overrides: Partial<ClientRequest> = {},
): Promise<ClientRequest> {
  const [row] = await sql<ClientRequest[]>`
    insert into client_requests (project_id, title, body, requester_name, created_at)
    values (
      ${projectId},
      ${overrides.title ?? "Export to CSV"},
      ${overrides.body ?? "We need to export the batch list for the auditors."},
      ${overrides.requester_name ?? "Priya"},
      ${overrides.created_at ?? sql`now()`}
    )
    returning *
  `;
  if (!row) throw new Error("createClientRequest: insert returned no row");
  return row;
}
