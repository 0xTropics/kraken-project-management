import { sql } from "@/lib/db/client";
import type { BillingModel, Currency } from "@/lib/db/types";

/**
 * Reporting.
 *
 * Two rules run through everything here:
 *
 *  1. **Currencies are never summed together.** A project bills in USD or CAD;
 *     adding them would produce a number that means nothing. Every total is
 *     grouped by currency and rendered separately.
 *  2. **Revenue counts finalized invoices only.** Drafts have not been issued
 *     and void invoices have been withdrawn, so neither is income.
 */

export interface ReportRange {
  from: string;
  to: string;
}

/* -------------------------------------------------------------------------- */
/* Revenue                                                                     */
/* -------------------------------------------------------------------------- */

export interface RevenueRow {
  month: string;
  client_id: string;
  client_name: string;
  currency: Currency;
  invoice_count: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  paid_total: number;
  sent_deposit_applied: number;
}

/**
 * Revenue per client per month, by currency. Bucketed on `period_end` -- or on
 * the issue date, when that is earlier. A month's work is still reported in
 * the month it was done even when the invoice goes out in the first week of
 * the next one; but a prepaid maintenance term issued in October 2026 and
 * ending in September 2027 is reported in October, when it was billed, not a
 * year later. Only an invoice issued before its period ends can move, and
 * single-month invoices are issued at or after their end. `least` ignores a
 * NULL `finalized_at`.
 */
export async function getRevenueReport(range: ReportRange): Promise<RevenueRow[]> {
  return sql<RevenueRow[]>`
    select to_char(least(i.period_end, i.finalized_at::date), 'YYYY-MM') as month,
           c.id                                        as client_id,
           c.name                                      as client_name,
           i.currency,
           count(*)::int                               as invoice_count,
           sum(i.subtotal)::numeric                    as subtotal,
           sum(i.tax_amount)::numeric                  as tax_amount,
           sum(i.total)::numeric                       as total,
           coalesce(sum(i.total) filter (where i.status = 'paid'), 0)::numeric as paid_total,
           coalesce(sum(i.deposit_applied) filter (where i.status = 'sent'), 0)::numeric as sent_deposit_applied
    from invoices i
    join projects p on p.id = i.project_id
    join clients  c on c.id = p.client_id
    where i.status in ('sent', 'paid')
      and least(i.period_end, i.finalized_at::date) >= ${range.from}
      and least(i.period_end, i.finalized_at::date) <= ${range.to}
    group by month, c.id, c.name, i.currency
    order by month desc, c.name, i.currency
  `;
}

export interface RevenueTotal {
  currency: Currency;
  total: number;
  paid_total: number;
  /**
   * Net of any deposit already drawn down against the still-`sent` invoices
   * behind this figure -- unlike `total` and `paid_total`, which stay gross
   * on purpose (a revenue report should not net a deposit received in an
   * earlier period out of the period it was billed in). "Outstanding" is a
   * debt-remaining number, not a revenue number, and every other place this
   * codebase shows a figure under that name (the clients page, the project
   * page) already nets it -- this one has to match or the same word means
   * two different amounts depending on which screen you're looking at.
   */
  outstanding: number;
}

export function summariseRevenue(rows: RevenueRow[]): RevenueTotal[] {
  // Accumulates one extra, unexported running sum (deposit applied against
  // this currency's still-`sent` invoices) alongside the public fields, so
  // `outstanding` can be netted correctly across every row for a currency,
  // not just the last one seen.
  const byCurrency = new Map<Currency, RevenueTotal & { sentDepositApplied: number }>();
  for (const row of rows) {
    const entry = byCurrency.get(row.currency) ?? {
      currency: row.currency,
      total: 0,
      paid_total: 0,
      outstanding: 0,
      sentDepositApplied: 0,
    };
    entry.total += row.total;
    entry.paid_total += row.paid_total;
    entry.sentDepositApplied += row.sent_deposit_applied;
    entry.outstanding =
      Math.round((entry.total - entry.paid_total - entry.sentDepositApplied) * 100) / 100;
    byCurrency.set(row.currency, entry);
  }
  return [...byCurrency.values()].map((entry) => ({
    currency: entry.currency,
    total: Math.round(entry.total * 100) / 100,
    paid_total: Math.round(entry.paid_total * 100) / 100,
    outstanding: entry.outstanding,
  }));
}

/* -------------------------------------------------------------------------- */
/* Utilization                                                                 */
/* -------------------------------------------------------------------------- */

export interface UtilizationRow {
  project_id: string;
  project_name: string;
  project_slug: string;
  client_name: string;
  billing_model: BillingModel;
  currency: Currency;
  hours_worked: number;
  hours_billed: number;
  /** Money actually invoiced in the range, by whichever model applies. */
  billed_amount: number;
  /** `billed_amount / hours_worked` — the number that reveals an underwater retainer. */
  effective_rate: number | null;
  nominal_rate: number | null;
}

/**
 * Hours worked, hours billed, and the effective rate per project.
 *
 * For an hourly project the billed amount is what the time is worth at its
 * rate. For a retainer it is the retainer actually invoiced in the range, which
 * is the whole point of the report: divide it by the hours really worked and
 * the true rate appears.
 */
export async function getUtilizationReport(range: ReportRange): Promise<UtilizationRow[]> {
  return sql<UtilizationRow[]>`
    with hours as (
      select t.project_id,
             sum(t.hours_worked)::numeric as hours_worked,
             sum(t.hours_billed)::numeric as hours_billed,
             sum(t.hours_billed * coalesce(t.rate_override, pr.hourly_rate, 0))::numeric
               as hourly_value
      from time_entries t
      join projects pr on pr.id = t.project_id
      where t.date >= ${range.from} and t.date <= ${range.to}
      group by t.project_id
    ),
    retainers as (
      select i.project_id, sum(i.subtotal)::numeric as retainer_value
      from invoices i
      where i.status in ('sent', 'paid')
        and least(i.period_end, i.finalized_at::date) >= ${range.from}
        and least(i.period_end, i.finalized_at::date) <= ${range.to}
      group by i.project_id
    )
    select p.id                as project_id,
           p.name              as project_name,
           p.slug              as project_slug,
           c.name              as client_name,
           p.billing_model,
           p.currency,
           coalesce(h.hours_worked, 0)::numeric as hours_worked,
           coalesce(h.hours_billed, 0)::numeric as hours_billed,
           case p.billing_model
             when 'hourly'   then coalesce(h.hourly_value, 0)
             else                 coalesce(r.retainer_value, 0)
           end::numeric        as billed_amount,
           case
             when coalesce(h.hours_worked, 0) > 0 then round(
               (case p.billing_model
                  when 'hourly' then coalesce(h.hourly_value, 0)
                  else               coalesce(r.retainer_value, 0)
                end) / h.hours_worked, 2)
             else null
           end                 as effective_rate,
           case p.billing_model when 'hourly' then p.hourly_rate else null end as nominal_rate
    from projects p
    join clients c on c.id = p.client_id
    left join hours     h on h.project_id = p.id
    left join retainers r on r.project_id = p.id
    where p.archived_at is null
      and (coalesce(h.hours_worked, 0) > 0 or coalesce(r.retainer_value, 0) > 0)
    order by c.name, p.name
  `;
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * RFC 4180 quoting: a field containing a comma, a quote, a newline, or leading
 * whitespace is quoted, and inner quotes are doubled. A leading `=`, `+`, `-`
 * or `@` is additionally prefixed with a single quote, because spreadsheets
 * treat those as formulas.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text) || text !== text.trim()) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  // CRLF and a trailing newline, per RFC 4180.
  return `${lines.join("\r\n")}\r\n`;
}

export function revenueCsv(rows: RevenueRow[]): string {
  return toCsv(
    ["Month", "Client", "Currency", "Invoices", "Subtotal", "Tax", "Total", "Paid", "Outstanding"],
    rows.map((r) => [
      r.month,
      r.client_name,
      r.currency,
      r.invoice_count,
      r.subtotal.toFixed(2),
      r.tax_amount.toFixed(2),
      r.total.toFixed(2),
      r.paid_total.toFixed(2),
      // Same netting as `summariseRevenue`'s "outstanding" -- this per-row
      // export has its own copy of the computation, so it gets the same fix.
      (Math.round((r.total - r.paid_total - r.sent_deposit_applied) * 100) / 100).toFixed(2),
    ]),
  );
}

export function utilizationCsv(rows: UtilizationRow[]): string {
  return toCsv(
    [
      "Client",
      "Project",
      "Billing model",
      "Currency",
      "Hours worked",
      "Hours billed",
      "Goodwill hours",
      "Billed amount",
      "Effective rate",
      "Nominal rate",
    ],
    rows.map((r) => [
      r.client_name,
      r.project_name,
      r.billing_model,
      r.currency,
      r.hours_worked.toFixed(2),
      r.hours_billed.toFixed(2),
      (Math.round((r.hours_worked - r.hours_billed) * 100) / 100).toFixed(2),
      r.billed_amount.toFixed(2),
      r.effective_rate === null ? "" : r.effective_rate.toFixed(2),
      r.nominal_rate === null ? "" : r.nominal_rate.toFixed(2),
    ]),
  );
}
