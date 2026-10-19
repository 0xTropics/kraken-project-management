import { sql } from "@/lib/db/client";
import type {
  BillingModel,
  Currency,
  DateString,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  ProjectStatus,
  Timestamp,
} from "@/lib/db/types";
import type { InvoicePdfData, InvoicePdfLine } from "@/lib/pdf/invoice-pdf";
import { companyDetails } from "@/lib/pdf/invoice-pdf";

/**
 * Read-side queries for the invoicing surfaces. Writes go through
 * `@/lib/invoices/engine`, which owns the lifecycle and the audit trail; this
 * module only ever selects.
 */

/* -------------------------------------------------------------------------- */
/* List rows                                                                   */
/* -------------------------------------------------------------------------- */

export interface InvoiceListRow {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  period_start: DateString;
  period_end: DateString;
  currency: Currency;
  total: number;
  published_at: Timestamp | null;
  paid_at: Timestamp | null;
  finalized_at: Timestamp | null;
  created_at: Timestamp;
  has_pdf: boolean;
  project_id: string;
  project_name: string;
  project_slug: string;
  client_name: string;
  line_count: number;
}

export interface InvoiceFilters {
  status?: InvoiceStatus | "outstanding";
  projectId?: string;
  currency?: Currency;
}

/** Fragments are built per call: a postgres.js fragment is not reusable. */
function whereFilters(filters: InvoiceFilters) {
  const { status, projectId, currency } = filters;
  return sql`
    where true
      ${
        status === "outstanding"
          ? sql`and i.status = 'sent'`
          : status
            ? sql`and i.status = ${status}`
            : sql``
      }
      ${projectId ? sql`and i.project_id = ${projectId}` : sql``}
      ${currency ? sql`and i.currency = ${currency}` : sql``}
  `;
}

/**
 * Sorted so the invoices that need a decision surface first: drafts, then the
 * outstanding ones, then the settled history, newest period first within each.
 */
function listOrder() {
  return sql`
    order by
      case i.status when 'draft' then 0 when 'sent' then 1 when 'paid' then 2 else 3 end,
      i.period_end desc, i.number desc nulls first, i.created_at desc
  `;
}

export async function listInvoices(filters: InvoiceFilters = {}): Promise<InvoiceListRow[]> {
  return sql<InvoiceListRow[]>`
    select i.id, i.number, i.status, i.period_start, i.period_end, i.currency, i.total,
           i.published_at, i.paid_at, i.finalized_at, i.created_at,
           (i.pdf_path is not null) as has_pdf,
           i.project_id, p.name as project_name, p.slug as project_slug,
           c.name as client_name,
           (select count(*)::int from invoice_lines l where l.invoice_id = i.id) as line_count
    from invoices i
    join projects p on p.id = i.project_id
    join clients c on c.id = p.client_id
    ${whereFilters(filters)}
    ${listOrder()}
  `;
}

export async function listProjectInvoices(projectId: string): Promise<InvoiceListRow[]> {
  return listInvoices({ projectId });
}

export interface CurrencyTotal {
  currency: Currency;
  outstanding: number;
  paid: number;
  draft: number;
  count: number;
}

/** Totals never mix currencies: USD and CAD are reported side by side. */
export async function invoiceTotalsByCurrency(
  filters: InvoiceFilters = {},
): Promise<CurrencyTotal[]> {
  return sql<CurrencyTotal[]>`
    select i.currency,
           coalesce(sum(i.total - i.deposit_applied) filter (where i.status = 'sent'), 0)  as outstanding,
           coalesce(sum(i.total) filter (where i.status = 'paid'), 0)  as paid,
           coalesce(sum(i.total) filter (where i.status = 'draft'), 0) as draft,
           count(*)::int as count
    from invoices i
    ${whereFilters(filters)}
    group by i.currency
    order by i.currency
  `;
}

export interface InvoiceFilterProject {
  id: string;
  name: string;
  slug: string;
  client_name: string;
}

export async function listProjectsWithInvoices(): Promise<InvoiceFilterProject[]> {
  return sql<InvoiceFilterProject[]>`
    select distinct p.id, p.name, p.slug, c.name as client_name
    from projects p
    join clients c on c.id = p.client_id
    join invoices i on i.project_id = p.id
    order by c.name, p.name
  `;
}

/* -------------------------------------------------------------------------- */
/* Detail                                                                      */
/* -------------------------------------------------------------------------- */

export interface InvoiceDetailProject {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  billing_model: BillingModel;
  hourly_rate: number | null;
  retainer_amount: number | null;
  payment_instructions: string | null;
  client_name: string;
  client_contact_name: string | null;
  client_contact_email: string | null;
}

export interface InvoiceTimeEntryRow {
  id: string;
  date: DateString;
  hours_worked: number;
  hours_billed: number;
  discount_reason: string | null;
  rate_override: number | null;
  description: string | null;
  work_item_title: string | null;
  locked: boolean;
}

type InvoiceRecord = Omit<Invoice, "updated_at">;

export interface InvoiceDetail extends InvoiceRecord {
  project: InvoiceDetailProject;
  lines: InvoiceLine[];
  time_entries: InvoiceTimeEntryRow[];
}

type InvoiceDetailRow = InvoiceRecord & {
  project_name: string;
  project_slug: string;
  project_status: ProjectStatus;
  billing_model: BillingModel;
  hourly_rate: number | null;
  retainer_amount: number | null;
  project_payment_instructions: string | null;
  client_name: string;
  client_contact_name: string | null;
  client_contact_email: string | null;
};

export async function getInvoiceDetail(invoiceId: string): Promise<InvoiceDetail | null> {
  const [row] = await sql<InvoiceDetailRow[]>`
    select i.id, i.project_id, i.number, i.status, i.period_start, i.period_end, i.currency,
           i.tax_rate, i.subtotal, i.tax_amount, i.total, i.deposit_applied, i.notes,
           i.payment_instructions,
           i.payment_method, i.payment_note, i.published_at, i.finalized_at, i.sent_at,
           i.paid_at, i.voided_at, i.pdf_path, i.created_at,
           p.name as project_name, p.slug as project_slug, p.status as project_status,
           p.billing_model, p.hourly_rate, p.retainer_amount,
           p.payment_instructions as project_payment_instructions,
           case when i.status = 'draft' then c.name   else i.bill_to_name          end as client_name,
           case when i.status = 'draft' then pc.name  else i.bill_to_contact_name  end as client_contact_name,
           case when i.status = 'draft' then pc.email else i.bill_to_contact_email end as client_contact_email
    from invoices i
    join projects p on p.id = i.project_id
    join clients c on c.id = p.client_id
    left join client_contacts pc on pc.client_id = c.id and pc.is_primary
    where i.id = ${invoiceId}
  `;
  if (!row) return null;

  const isDraft = row.status === "draft";
  const [lines, entries] = await Promise.all([
    sql<InvoiceLine[]>`
      select * from invoice_lines where invoice_id = ${invoiceId} order by sort_order, created_at
    `,
    // A draft shows what it *would* pull in on finalize; a finalized invoice
    // shows what it actually locked.
    sql<InvoiceTimeEntryRow[]>`
      select t.id, t.date, t.hours_worked, t.hours_billed, t.discount_reason,
             t.rate_override, t.description, w.title as work_item_title,
             (t.invoice_id is not null) as locked
      from time_entries t
      left join work_items w on w.id = t.work_item_id
      where t.project_id = ${row.project_id}
        and (
          t.invoice_id = ${invoiceId}
          or (${isDraft} and t.invoice_id is null
              and t.date >= ${row.period_start} and t.date <= ${row.period_end})
        )
      order by t.date, t.created_at
    `,
  ]);

  const {
    project_name, project_slug, project_status, billing_model, hourly_rate, retainer_amount,
    project_payment_instructions, client_name, client_contact_name, client_contact_email,
    ...invoice
  } = row;
  return {
    ...invoice,
    payment_instructions: invoice.payment_instructions ?? project_payment_instructions,
    project: {
      id: invoice.project_id,
      name: project_name,
      slug: project_slug,
      status: project_status,
      billing_model,
      hourly_rate,
      retainer_amount,
      payment_instructions: project_payment_instructions,
      client_name,
      client_contact_name,
      client_contact_email,
    },
    lines,
    time_entries: entries,
  };
}

/* -------------------------------------------------------------------------- */
/* PDF payload                                                                 */
/* -------------------------------------------------------------------------- */

export interface InvoicePdfPayload {
  projectId: string;
  number: string | null;
  status: InvoiceStatus;
  data: InvoicePdfData;
  lines: InvoicePdfLine[];
}

/** Everything the PDF renders. */
export async function getInvoicePdfPayload(invoiceId: string): Promise<InvoicePdfPayload | null> {
  const detail = await getInvoiceDetail(invoiceId);
  if (!detail) return null;

  return {
    projectId: detail.project_id,
    number: detail.number,
    status: detail.status,
    lines: detail.lines,
    data: {
      number: detail.number,
      status: detail.status,
      issue_date: detail.finalized_at ?? detail.created_at,
      period_start: detail.period_start,
      period_end: detail.period_end,
      currency: detail.currency,
      tax_rate: detail.tax_rate,
      subtotal: detail.subtotal,
      tax_amount: detail.tax_amount,
      total: detail.total,
      deposit_applied: detail.deposit_applied,
      notes: detail.notes,
      payment_instructions: detail.payment_instructions,
      payment_method: detail.payment_method,
      paid_at: detail.paid_at,
      project: { name: detail.project.name, billing_model: detail.project.billing_model },
      client: {
        name: detail.project.client_name,
        contact_name: detail.project.client_contact_name,
        contact_email: detail.project.client_contact_email,
      },
      company: companyDetails(),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Retainer run support                                                        */
/* -------------------------------------------------------------------------- */

export interface RetainerCandidate {
  id: string;
  name: string;
  slug: string;
  currency: Currency;
  retainer_amount: number | null;
  client_name: string;
  existing_invoice_id: string | null;
  existing_number: string | null;
  existing_status: InvoiceStatus | null;
}

/**
 * Active retainer projects, each tagged with the live invoice (if any) already
 * covering the given month. Void invoices do not count as coverage, so a month
 * that was voided can be reissued by running again.
 */
export async function retainerCandidates(
  periodStart: DateString,
  periodEnd: DateString,
): Promise<RetainerCandidate[]> {
  return sql<RetainerCandidate[]>`
    select p.id, p.name, p.slug, p.currency, p.retainer_amount, c.name as client_name,
           existing.id as existing_invoice_id, existing.number as existing_number,
           existing.status as existing_status
    from projects p
    join clients c on c.id = p.client_id
    left join lateral (
      select i.id, i.number, i.status
      from invoices i
      where i.project_id = p.id
        and i.status <> 'void'
        and i.period_start <= ${periodEnd}
        and i.period_end >= ${periodStart}
      order by i.created_at
      limit 1
    ) existing on true
    where p.billing_model = 'retainer'
      and p.status = 'active'
      and p.archived_at is null
    order by c.name, p.name
  `;
}
