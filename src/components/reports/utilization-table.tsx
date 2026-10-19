import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { billingModelLabel } from "@/lib/billing-model";
import { cn } from "@/lib/cn";
import { formatHours, formatMoney } from "@/lib/format";
import type { UtilizationRow } from "@/lib/data/reports";
import type { Currency } from "@/lib/db/types";

/**
 * Utilization per project.
 *
 * The column that matters is `effective rate` -- billed money over hours really
 * worked. A retainer has no nominal rate of its own, so it is measured against
 * the median hourly rate charged on the same currency's projects: that is the
 * comparison that makes an underwater retainer visible instead of merely
 * available.
 */

/** More than a tenth below the reference is worth flagging, not rounding noise. */
const UNDERWATER = 0.9;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function RateMeter({ ratio, underwater }: { ratio: number; underwater: boolean }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--accent-subtle)]"
      aria-hidden="true"
    >
      <div
        className={cn(
          "h-full rounded-full",
          underwater ? "bg-[var(--warning)]" : "bg-[var(--accent)]",
        )}
        style={{ width: `${Math.max(2, Math.min(100, ratio * 100))}%` }}
      />
    </div>
  );
}

export function UtilizationTable({ rows }: { rows: UtilizationRow[] }) {
  const currencies = [...new Set(rows.map((row) => row.currency))].sort() as Currency[];

  return (
    <div className="space-y-4">
      {currencies.map((currency) => {
        const scoped = rows.filter((row) => row.currency === currency);
        const benchmark = median(
          scoped
            .filter((row) => row.billing_model === "hourly" && row.nominal_rate)
            .map((row) => row.nominal_rate as number),
        );

        const worked = scoped.reduce((sum, row) => sum + row.hours_worked, 0);
        const billedHours = scoped.reduce((sum, row) => sum + row.hours_billed, 0);
        const amount = scoped.reduce((sum, row) => sum + row.billed_amount, 0);
        const blended = worked > 0 ? Math.round((amount / worked) * 100) / 100 : null;

        return (
          <div
            key={currency}
            className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]"
          >
            <Table label={`Utilization per project, in ${currency}`}>
              <caption className="border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-3 py-2 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                Utilization · {currency}
              </caption>
              <THead>
                <TR>
                  <TH>Project</TH>
                  <TH numeric>Worked</TH>
                  <TH numeric className="hidden sm:table-cell">
                    Billed
                  </TH>
                  <TH numeric className="hidden lg:table-cell">
                    Gap
                  </TH>
                  <TH numeric className="hidden md:table-cell">
                    Billed amount
                  </TH>
                  <TH numeric>Effective</TH>
                  <TH numeric className="hidden sm:table-cell">
                    Nominal
                  </TH>
                  <TH className="hidden w-32 xl:table-cell">
                    <span className="sr-only">Effective against nominal</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {scoped.map((row) => {
                  const reference =
                    row.billing_model === "hourly" ? row.nominal_rate : benchmark;
                  const effective = row.effective_rate;
                  const underwater =
                    effective !== null &&
                    reference !== null &&
                    reference > 0 &&
                    effective < reference * UNDERWATER;
                  const ratio =
                    effective !== null && reference && reference > 0 ? effective / reference : 0;
                  const gap = Math.round((row.hours_worked - row.hours_billed) * 100) / 100;

                  return (
                    <TR key={row.project_id}>
                      <TD
                        className={cn(
                          "max-w-64 border-l-2",
                          underwater ? "border-l-[var(--warning)]" : "border-l-transparent",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium text-[var(--text-primary)]">
                            {row.project_name}
                          </span>
                          <Badge tone="neutral" className="shrink-0">
                            {billingModelLabel(row.billing_model)}
                          </Badge>
                          {underwater && (
                            <Badge tone="warning" className="shrink-0">
                              Underwater
                            </Badge>
                          )}
                        </div>
                        <span className="block truncate text-2xs text-[var(--text-tertiary)]">
                          {row.client_name}
                        </span>
                      </TD>

                      <TD numeric className="text-[var(--text-primary)]">
                        {formatHours(row.hours_worked)}
                      </TD>
                      <TD numeric className="hidden sm:table-cell">
                        {formatHours(row.hours_billed)}
                      </TD>
                      <TD
                        numeric
                        className={cn(
                          "hidden lg:table-cell",
                          gap > 0 ? "text-[var(--warning)]" : "text-[var(--text-tertiary)]",
                        )}
                      >
                        {gap > 0 ? `−${formatHours(gap)}` : "—"}
                      </TD>
                      <TD numeric className="hidden md:table-cell">
                        {formatMoney(row.billed_amount, currency)}
                      </TD>
                      <TD
                        numeric
                        className={cn(
                          "font-medium",
                          underwater ? "text-[var(--warning)]" : "text-[var(--text-primary)]",
                        )}
                      >
                        {effective === null ? "—" : `${formatMoney(effective, currency)}/h`}
                      </TD>
                      <TD numeric className="hidden sm:table-cell">
                        {row.nominal_rate !== null ? (
                          `${formatMoney(row.nominal_rate, currency)}/h`
                        ) : benchmark !== null ? (
                          <Tooltip
                            content={`A retainer has no nominal rate. Compared against the median hourly rate on your ${currency} projects.`}
                          >
                            <span className="cursor-help text-[var(--text-tertiary)] underline decoration-dotted underline-offset-2">
                              ≈{formatMoney(benchmark, currency)}/h
                            </span>
                          </Tooltip>
                        ) : (
                          <span className="text-[var(--text-tertiary)]">—</span>
                        )}
                      </TD>
                      <TD className="hidden w-32 xl:table-cell">
                        {reference ? <RateMeter ratio={ratio} underwater={underwater} /> : null}
                      </TD>
                    </TR>
                  );
                })}

                <TR className="bg-[var(--bg-sunken)]">
                  <TD className="border-l-2 border-l-transparent text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                    {currency} total
                  </TD>
                  <TD numeric className="font-semibold text-[var(--text-primary)]">
                    {formatHours(Math.round(worked * 100) / 100)}
                  </TD>
                  <TD numeric className="hidden font-semibold text-[var(--text-primary)] sm:table-cell">
                    {formatHours(Math.round(billedHours * 100) / 100)}
                  </TD>
                  <TD
                    numeric
                    className={cn(
                      "hidden lg:table-cell",
                      worked - billedHours > 0.005
                        ? "font-semibold text-[var(--warning)]"
                        : "text-[var(--text-tertiary)]",
                    )}
                  >
                    {worked - billedHours > 0.005
                      ? `−${formatHours(Math.round((worked - billedHours) * 100) / 100)}`
                      : "—"}
                  </TD>
                  <TD numeric className="hidden font-semibold text-[var(--text-primary)] md:table-cell">
                    {formatMoney(Math.round(amount * 100) / 100, currency)}
                  </TD>
                  <TD numeric className="font-semibold text-[var(--text-primary)]">
                    {blended === null ? "—" : `${formatMoney(blended, currency)}/h`}
                  </TD>
                  <TD numeric className="hidden sm:table-cell" />
                  <TD className="hidden xl:table-cell" />
                </TR>
              </TBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}
