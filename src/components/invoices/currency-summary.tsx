import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import type { CurrencyTotal } from "@/lib/data/invoices";

/**
 * Money per currency, never across them: USD and CAD are separate books, and
 * adding them would produce a number that is true of nothing.
 *
 * Outstanding is the headline because it is the only figure that implies an
 * action — someone owes it and has not paid.
 */
export function CurrencySummary({
  totals,
  className,
}: {
  totals: CurrencyTotal[];
  className?: string;
}) {
  if (totals.length === 0) return null;

  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2",
        totals.length > 2 ? "xl:grid-cols-3" : "xl:grid-cols-2",
        className,
      )}
    >
      {totals.map((row) => {
        const owed = row.outstanding > 0;
        return (
          <div
            key={row.currency}
            className={cn(
              "rounded-[var(--radius-lg)] border p-4",
              owed
                ? "border-[var(--warning-subtle)] bg-[var(--warning-subtle)]"
                : "border-[var(--border-subtle)]",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                Outstanding · {row.currency}
              </span>
              <span className="text-2xs tabular-nums text-[var(--text-tertiary)]">
                {row.count} invoice{row.count === 1 ? "" : "s"}
              </span>
            </div>
            <p
              className={cn(
                "mt-1.5 text-2xl font-semibold tabular-nums",
                owed ? "text-[var(--warning-text)]" : "text-[var(--text-primary)]",
              )}
            >
              {formatMoney(row.outstanding, row.currency)}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-[var(--text-tertiary)]">
              <span>
                Paid{" "}
                <span className="text-[var(--text-secondary)]">
                  {formatMoney(row.paid, row.currency)}
                </span>
              </span>
              <span>
                Draft{" "}
                <span className="text-[var(--text-secondary)]">
                  {formatMoney(row.draft, row.currency)}
                </span>
              </span>
            </p>
          </div>
        );
      })}
    </div>
  );
}
