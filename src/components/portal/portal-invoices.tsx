import { Download } from "lucide-react";
import type { PortalHours, PortalInvoice, PortalProject } from "@/lib/data/portal";
import { hoursInvoicedToDate, outstandingTotal } from "@/lib/portal/derive";
import { formatDate, formatHours, formatMoney } from "@/lib/format";
import { PortalPill } from "./primitives";

/**
 * The commercial tab. Nothing here appears on the Overview.
 *
 * `hours` is null on a retainer project, and then the hours tiles are
 * absent rather than zero: "0h" on a retainer implies hours are being counted
 * and none were worked, which is false. An e2e spec asserts this.
 *
 * Both lists below are `tabIndex={0}` with their own `aria-label`, same as the
 * board's columns and the updates rail: once `lg:overflow-y-auto` makes one
 * scrollable, it needs a keyboard tab stop, and once it is a tab stop it needs
 * a name that is not just the enclosing `<section>`'s (axe's
 * `scrollable-region-focusable`).
 */
export function PortalInvoicesTab({
  project,
  invoices,
  hours,
  preview = false,
}: {
  project: PortalProject;
  invoices: PortalInvoice[];
  hours: PortalHours | null;
  preview?: boolean;
}) {
  const outstanding = outstandingTotal(invoices);
  const unpaid = invoices.filter((invoice) => invoice.status === "sent").length;

  // A completed, handed-over project showing a live billable counter implies
  // work is ongoing. Prior invoiced periods still make sense; the running
  // total does not.
  const showCurrentHours = hours && project.status !== "completed";

  const tileCount = 1 + (showCurrentHours ? 1 : 0) + (hours ? 1 : 0);

  // Size the grid to the tiles actually present -- fewer tiles (a completed
  // hourly project drops one, a retainer project has only ever had one) fill
  // the row evenly instead of leaving a gap where a third or second tile used
  // to be.
  const tileGridCols =
    tileCount === 1
      ? "sm:grid-cols-1 lg:grid-cols-1"
      : tileCount === 2
        ? "sm:grid-cols-2 lg:grid-cols-2"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className={`grid shrink-0 gap-5 ${tileGridCols}`}>
        <Tile label="Outstanding" value={formatMoney(outstanding, project.currency)}>
          {unpaid === 0
            ? "Nothing awaiting payment"
            : `${unpaid} invoice${unpaid === 1 ? "" : "s"} awaiting payment`}
        </Tile>

        {showCurrentHours && (
          <Tile label="Hours this period" value={formatHours(hours.current_period_hours)}>
            logged, not yet invoiced
          </Tile>
        )}

        {hours && (
          <Tile label="Invoiced to date" value={formatHours(hoursInvoicedToDate(hours))}>
            across {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
          </Tile>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section
          aria-label="Invoices"
          className="flex min-h-0 flex-col rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-panel)]"
        >
          <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-[var(--border-subtle)] px-5 pb-3 pt-4">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.09em] text-[var(--text-tertiary)]">
              All invoices
            </h2>
            <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
              {invoices.length}
            </span>
          </header>

          {invoices.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--text-tertiary)]">
              No invoices have been issued yet. They appear here as they are sent, each with a PDF
              you can download.
            </p>
          ) : (
            <ul
              tabIndex={0}
              aria-label="Invoices list"
              className="scroll-thin relative divide-y divide-[var(--border-subtle)] px-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
            >
              {invoices.map((invoice) => (
                <li
                  key={invoice.id}
                  className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 py-4"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2.5">
                      <span className="text-md font-medium text-[var(--text-primary)]">
                        {invoice.number}
                      </span>
                      <PortalPill tone={invoice.status === "paid" ? "success" : "info"}>
                        {invoice.status === "paid" ? "Paid" : "Sent"}
                      </PortalPill>
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
                      {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
                    </p>
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      {/* The amount due, net of any deposit -- matching the PDF,
                          which is the document of record. The gross total is a
                          struck-through reference, never the headline. */}
                      <span className="text-md font-medium tabular-nums text-[var(--text-primary)]">
                        {formatMoney(invoice.total - invoice.deposit_applied, invoice.currency)}
                      </span>
                      {invoice.deposit_applied > 0 && (
                        <p className="mt-0.5 text-xs tabular-nums text-[var(--text-tertiary)]">
                          <span className="line-through">
                            {formatMoney(invoice.total, invoice.currency)}
                          </span>{" "}
                          less {formatMoney(invoice.deposit_applied, invoice.currency)} deposit
                        </p>
                      )}
                    </div>

                    {preview ? (
                      <span
                        title="Download is disabled in the preview; the client's link is signed for them."
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] px-3 py-1.5 text-base font-medium text-[var(--text-tertiary)]"
                      >
                        <Download className="size-3.5" />
                        PDF
                      </span>
                    ) : (
                      <a
                        href={`/api/portal/invoices/${invoice.id}/download`}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-base font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] sm:min-h-0 sm:py-1.5"
                      >
                        <Download className="size-3.5" />
                        PDF
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {hours && hours.periods.length > 0 && (
          <section
            aria-label="Hours by period"
            className="flex min-h-0 flex-col rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-panel)]"
          >
            <header className="shrink-0 border-b border-[var(--border-subtle)] px-5 pb-3 pt-4">
              <h2 className="text-2xs font-semibold uppercase tracking-[0.09em] text-[var(--text-tertiary)]">
                Hours by period
              </h2>
            </header>
            <ul
              tabIndex={0}
              aria-label="Hours by period list"
              className="scroll-thin relative divide-y divide-[var(--border-subtle)] px-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
            >
              {hours.periods.map((period) => (
                <li key={period.invoice_number} className="flex items-baseline justify-between gap-4 py-3.5">
                  <span className="text-base text-[var(--text-secondary)]">
                    {formatDate(period.period_start)} – {formatDate(period.period_end)}
                  </span>
                  <span className="text-base font-medium tabular-nums text-[var(--text-primary)]">
                    {formatHours(period.hours)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-5 py-4">
      <p className="text-2xs font-semibold uppercase tracking-[0.09em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{value}</p>
      <p className="mt-2 text-sm text-[var(--text-tertiary)]">{children}</p>
    </div>
  );
}
