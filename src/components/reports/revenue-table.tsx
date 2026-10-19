import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, monthLabel } from "@/lib/format";
import type { RevenueRow } from "@/lib/data/reports";
import type { Currency } from "@/lib/db/types";

/**
 * The chart's data in words. Every figure the chart draws is readable here, so
 * nothing is gated behind hovering a bar.
 *
 * One table per currency, each with its own total row. There is deliberately no
 * grand total: adding USD to CAD would produce a number that means nothing.
 */
export function RevenueTable({ rows }: { rows: RevenueRow[] }) {
  const currencies = [...new Set(rows.map((row) => row.currency))].sort() as Currency[];

  return (
    <div className="space-y-4">
      {currencies.map((currency) => {
        const scoped = rows.filter((row) => row.currency === currency);
        const total = scoped.reduce((sum, row) => sum + row.total, 0);
        const paid = scoped.reduce((sum, row) => sum + row.paid_total, 0);
        // Deposits already applied to sent invoices are money in hand, so they
        // come off "outstanding" -- same netting as summariseRevenue's Stat tile.
        const deposits = scoped.reduce((sum, row) => sum + row.sent_deposit_applied, 0);
        const scopedOutstanding = Math.round((total - paid - deposits) * 100) / 100;
        const invoices = scoped.reduce((sum, row) => sum + row.invoice_count, 0);

        return (
          <div
            key={currency}
            className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]"
          >
            <Table label={`Revenue per client per month, in ${currency}`}>
              <caption className="border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-3 py-2 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                Revenue in {currency}
              </caption>
              <THead>
                <TR>
                  <TH>Month</TH>
                  <TH>Client</TH>
                  <TH numeric className="hidden sm:table-cell">
                    Invoices
                  </TH>
                  <TH numeric className="hidden md:table-cell">
                    Subtotal
                  </TH>
                  <TH numeric className="hidden lg:table-cell">
                    Tax
                  </TH>
                  <TH numeric>Total</TH>
                  <TH numeric className="hidden sm:table-cell">
                    Paid
                  </TH>
                  <TH numeric>Outstanding</TH>
                </TR>
              </THead>
              <TBody>
                {scoped.map((row) => {
                  const outstanding =
                    Math.round((row.total - row.paid_total - row.sent_deposit_applied) * 100) / 100;
                  return (
                    <TR key={`${row.month}-${row.client_id}`}>
                      <TD className="whitespace-nowrap text-[var(--text-primary)]">
                        {monthLabel(row.month)}
                      </TD>
                      <TD className="max-w-52 truncate text-[var(--text-primary)]">
                        {row.client_name}
                      </TD>
                      <TD numeric className="hidden sm:table-cell">
                        {row.invoice_count}
                      </TD>
                      <TD numeric className="hidden md:table-cell">
                        {formatMoney(row.subtotal, currency)}
                      </TD>
                      <TD numeric className="hidden lg:table-cell">
                        {formatMoney(row.tax_amount, currency)}
                      </TD>
                      <TD numeric className="font-medium text-[var(--text-primary)]">
                        {formatMoney(row.total, currency)}
                      </TD>
                      <TD numeric className="hidden sm:table-cell">
                        {formatMoney(row.paid_total, currency)}
                      </TD>
                      <TD
                        numeric
                        className={
                          outstanding > 0
                            ? "text-[var(--warning)]"
                            : "text-[var(--text-tertiary)]"
                        }
                      >
                        {outstanding > 0 ? formatMoney(outstanding, currency) : "—"}
                      </TD>
                    </TR>
                  );
                })}
                <TR className="bg-[var(--bg-sunken)]">
                  <TD colSpan={2} className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                    {currency} total
                  </TD>
                  <TD numeric className="hidden font-medium text-[var(--text-primary)] sm:table-cell">
                    {invoices}
                  </TD>
                  <TD numeric className="hidden md:table-cell" />
                  <TD numeric className="hidden lg:table-cell" />
                  <TD numeric className="font-semibold text-[var(--text-primary)]">
                    {formatMoney(Math.round(total * 100) / 100, currency)}
                  </TD>
                  <TD numeric className="hidden font-medium text-[var(--text-primary)] sm:table-cell">
                    {formatMoney(Math.round(paid * 100) / 100, currency)}
                  </TD>
                  <TD
                    numeric
                    className={
                      scopedOutstanding > 0.005
                        ? "font-semibold text-[var(--warning)]"
                        : "text-[var(--text-tertiary)]"
                    }
                  >
                    {scopedOutstanding > 0.005 ? formatMoney(scopedOutstanding, currency) : "—"}
                  </TD>
                </TR>
              </TBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}
