import Link from "next/link";
import { Eye } from "lucide-react";
import { Badge, INVOICE_STATUS_META } from "@/components/ui/badge";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney } from "@/lib/format";
import type { InvoiceListRow } from "@/lib/data/invoices";

/**
 * One invoice list, used by the cross-project view and by a project's own tab.
 *
 * The amount column carries the state as well as the number: an unpaid sent
 * invoice is the only row that owes anyone anything, so it is the only one
 * tinted, and a void row is struck through so a scan never mistakes it for
 * money that exists.
 *
 * Below 640px the table becomes a two-line list rather than a horizontal
 * scroller. Five columns cannot fit in 390px without pushing the total -- the
 * one number the whole screen exists to show -- off the right edge.
 */

/** Shared between both layouts so the two never disagree about emphasis. */
function amountClass(status: InvoiceListRow["status"]): string {
  return cn(
    "font-medium tabular-nums",
    status === "sent" && "text-[var(--warning-text)]",
    status === "void" && "text-[var(--text-tertiary)] line-through",
    (status === "paid" || status === "draft") && "text-[var(--text-primary)]",
  );
}

export function InvoiceTable({
  rows,
  showProject = true,
}: {
  rows: InvoiceListRow[];
  showProject?: boolean;
}) {
  return (
    <>
      {/* Phone ---------------------------------------------------------- */}
      <ul className="divide-y divide-[var(--border-subtle)] sm:hidden">
        {rows.map((row) => {
          const meta = INVOICE_STATUS_META[row.status];
          return (
            <li key={row.id}>
              <Link
                href={`/app/invoices/${row.id}`}
                className="flex flex-col gap-1 px-3 py-2.5 transition-colors duration-75 hover:bg-[var(--bg-hover)]"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-base font-medium tabular-nums text-[var(--text-primary)]">
                    {row.number ?? "Draft"}
                  </span>
                  <span className={cn(amountClass(row.status), "shrink-0 text-base")}>
                    {formatMoney(row.total, row.currency)}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-[var(--text-tertiary)]">
                    {showProject ? row.project_name : formatDate(row.period_start)}
                    <span aria-hidden="true"> · </span>
                    {showProject ? row.client_name : formatDate(row.period_end)}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {row.published_at && (
                      <Eye
                        className="size-3 text-[var(--accent-text)]"
                        aria-label="Visible in the client portal"
                      />
                    )}
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Tablet and up --------------------------------------------------- */}
      <div className="hidden sm:block">
        <Table label="Invoices">
          <THead>
            <tr>
              <TH className="w-[7.5rem]">Number</TH>
              {showProject && <TH>Project</TH>}
              <TH className="hidden md:table-cell">Period</TH>
              <TH className="w-24">Status</TH>
              <TH numeric>Total</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => {
              const meta = INVOICE_STATUS_META[row.status];
              const href = `/app/invoices/${row.id}`;
              return (
                <TR key={row.id} interactive>
                  <TD>
                    <Link
                      href={href}
                      className="block truncate font-medium tabular-nums text-[var(--text-primary)] hover:text-[var(--accent-text)]"
                    >
                      {row.number ?? "Draft"}
                    </Link>
                  </TD>
                  {showProject && (
                    <TD>
                      <Link href={href} className="block max-w-[18rem]">
                        <span className="block truncate text-[var(--text-primary)]">
                          {row.project_name}
                        </span>
                        <span className="block truncate text-2xs text-[var(--text-tertiary)]">
                          {row.client_name}
                        </span>
                      </Link>
                    </TD>
                  )}
                  <TD className="hidden whitespace-nowrap md:table-cell">
                    <Link href={href} className="block tabular-nums">
                      {formatDate(row.period_start)} – {formatDate(row.period_end)}
                    </Link>
                  </TD>
                  <TD>
                    <span className="flex items-center gap-1.5">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {row.published_at && (
                        <Tooltip content="Visible in the client portal">
                          <Eye className="size-3 shrink-0 text-[var(--accent-text)]" />
                        </Tooltip>
                      )}
                    </span>
                  </TD>
                  <TD numeric>
                    <Link href={href} className={cn("block", amountClass(row.status))}>
                      {formatMoney(row.total, row.currency)}
                    </Link>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </>
  );
}
