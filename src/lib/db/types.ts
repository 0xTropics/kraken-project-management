/** Row shapes and enum unions mirroring supabase/migrations. */

export const PROJECT_STATUSES = ["active", "paused", "completed", "archived"] as const;
export const BILLING_MODELS = ["hourly", "retainer", "maintenance"] as const;
export const CURRENCIES = ["USD", "CAD"] as const;
export const MILESTONE_STATUSES = ["open", "done"] as const;
export const WORK_ITEM_TYPES = ["feature", "bug", "chore"] as const;
export const WORK_ITEM_STATUSES = [
  "backlog",
  "planned",
  "in_progress",
  "done",
  "wont_do",
] as const;
export const WORK_ITEM_PRIORITIES = ["low", "medium", "high"] as const;
export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export const INVOICE_LINE_KINDS = [
  "time",
  "retainer",
  "adhoc",
  "discount",
  "maintenance",
  "build",
] as const;
export const PAYMENT_METHODS = ["cash", "crypto", "etransfer"] as const;
export const ACTOR_TYPES = ["user", "agent", "portal"] as const;
export const CLIENT_REQUEST_STATUSES = ["submitted", "accepted", "declined"] as const;
export const CHARGE_KINDS = ["expense", "fixed", "commission", "build"] as const;
/** Months a maintenance term covers: month by month, or prepaid for 6 or 12. */
export const MAINTENANCE_TERMS = [1, 6, 12] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type BillingModel = (typeof BILLING_MODELS)[number];
export type Currency = (typeof CURRENCIES)[number];
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type InvoiceLineKind = (typeof INVOICE_LINE_KINDS)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type ActorType = (typeof ACTOR_TYPES)[number];
export type ChargeKind = (typeof CHARGE_KINDS)[number];
export type ClientRequestStatus = (typeof CLIENT_REQUEST_STATUSES)[number];
export type MaintenanceTerm = (typeof MAINTENANCE_TERMS)[number];

/** Calendar date as `YYYY-MM-DD`; see the driver config in db/client.ts. */
export type DateString = string;
/** Timestamp as an ISO string once serialised across a route boundary. */
export type Timestamp = string;

export interface Client {
  id: string;
  name: string;
  notes: string | null;
  archived_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ClientContact {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  is_primary: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Project {
  id: string;
  client_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  billing_model: BillingModel;
  currency: Currency;
  hourly_rate: number | null;
  retainer_amount: number | null;
  tax_rate: number;
  portal_password_hash: string;
  portal_password_version: number;
  payment_instructions: string | null;
  retainer_show_hours: boolean;
  /** Build + maintenance only. The whole build fee; installments are `build` charges capped by it. */
  build_fee: number | null;
  maintenance_monthly: number | null;
  /** The whole 6-month term's price. Null means 6 × monthly, no discount line. */
  maintenance_price_6: number | null;
  /** The whole 12-month term's price. Null means 12 × monthly, no discount line. */
  maintenance_price_12: number | null;
  maintenance_term_months: MaintenanceTerm;
  /** Always the 1st. Null while the site is still being built: no term can be drafted. */
  maintenance_starts_on: DateString | null;
  repo_url: string | null;
  started_at: DateString | null;
  archived_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** A project without its password hash. Nothing that leaves the data layer carries the hash. */
export type SafeProject = Omit<Project, "portal_password_hash">;

export interface ProjectDeposit {
  id: string;
  project_id: string;
  amount: number;
  received_on: DateString;
  method: PaymentMethod;
  note: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ProjectCharge {
  id: string;
  project_id: string;
  kind: ChargeKind;
  description: string;
  amount: number;
  taxable: boolean;
  incurred_on: DateString;
  note: string | null;
  /** Set when a charge whose only lines are on voided invoices is withdrawn. It no longer sweeps or counts. */
  cancelled_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  target_date: DateString | null;
  status: MilestoneStatus;
  client_visible: boolean;
  sort_order: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface WorkItem {
  id: string;
  project_id: string;
  milestone_id: string | null;
  type: WorkItemType;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  title: string;
  description: string | null;
  client_visible: boolean;
  sort_order: number;
  completed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ProgressNote {
  id: string;
  project_id: string;
  work_item_id: string | null;
  body: string;
  approved_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ProjectNote {
  id: string;
  project_id: string;
  title: string;
  body: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TimeEntry {
  id: string;
  project_id: string;
  work_item_id: string | null;
  date: DateString;
  hours_worked: number;
  hours_billed: number;
  discount_reason: string | null;
  rate_override: number | null;
  description: string | null;
  invoice_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Invoice {
  id: string;
  project_id: string;
  number: string | null;
  status: InvoiceStatus;
  period_start: DateString;
  period_end: DateString;
  currency: Currency;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  deposit_applied: number;
  notes: string | null;
  payment_instructions: string | null;
  payment_method: PaymentMethod | null;
  payment_note: string | null;
  published_at: Timestamp | null;
  finalized_at: Timestamp | null;
  sent_at: Timestamp | null;
  paid_at: Timestamp | null;
  voided_at: Timestamp | null;
  pdf_path: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  kind: InvoiceLineKind;
  description: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  charge_id: string | null;
  taxable: boolean;
  sort_order: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ClientRequest {
  id: string;
  project_id: string;
  title: string;
  body: string;
  requester_name: string;
  status: ClientRequestStatus;
  decline_note: string | null;
  work_item_id: string | null;
  decided_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AuditLogEntry {
  id: string;
  actor_type: ActorType;
  actor_id: string | null;
  actor_label: string | null;
  project_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  created_at: Timestamp;
}

export interface InternalUser {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
  supabase_uid: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * Features are client-visible by default unless still in the backlog;
 * bugs and chores are internal until someone says otherwise.
 */
export function defaultClientVisible(type: WorkItemType, status: WorkItemStatus): boolean {
  if (type !== "feature") return false;
  return status !== "backlog";
}

/** Statuses the portal will render, and the label the client sees. */
export const PORTAL_STATUS_LABELS: Partial<Record<WorkItemStatus, string>> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
};

export const PORTAL_VISIBLE_STATUSES = ["planned", "in_progress", "done"] as const;
