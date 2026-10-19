import { cn } from "@/lib/cn";
import { formatMoney, monthLabel } from "@/lib/format";
import type { RevenueRow } from "@/lib/data/reports";
import type { Currency } from "@/lib/db/types";

/**
 * Finalized revenue by month, one panel per currency.
 *
 * Small multiples rather than one plot with two series, because USD and CAD
 * share no scale: putting them on one axis would invite exactly the comparison
 * the rest of this app refuses to make.
 *
 * Drawn by hand, and deliberately without a `viewBox`: percentage x-positions
 * inside nested `<svg>` bands keep the geometry fluid while every label stays a
 * true 11px at any width. A scaled viewBox would shrink the type on a phone.
 */

const HEIGHT = 190;
/** Headroom for the direct label above the tallest column. */
const TOP = 22;
/** The x-axis label band, inside the same box — never clipped off the bottom. */
const AXIS_BAND = 20;
const BASELINE = HEIGHT - AXIS_BAND;
const CORNER = 4;
/** The surface gap that separates the two stacked segments. */
const GAP = 2;

interface Column {
  month: string;
  total: number;
  paid: number;
  outstanding: number;
}

/** Round a maximum up to a number a human would put on an axis. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

function axisMoney(value: number, currency: Currency): string {
  const prefix = currency === "CAD" ? "CA$" : "$";
  if (value === 0) return "0";
  if (value >= 1000) {
    // Exact, never rounded: a tick that says 3.8k when the gridline is at 3,750
    // makes every value read off it slightly wrong.
    const thousands = value / 1000;
    const text = thousands
      .toFixed(2)
      .replace(/\.?0+$/, "");
    return `${prefix}${text}k`;
  }
  return `${prefix}${Math.round(value)}`;
}

function CurrencyPanel({
  currency,
  columns,
  total,
}: {
  currency: Currency;
  columns: Column[];
  total: number;
}) {
  const bands = columns.length;
  const bandPercent = 100 / bands;
  const barWidth = bands > 16 ? 10 : bands > 12 ? 14 : bands > 6 ? 20 : 24;
  const ceiling = niceCeiling(Math.max(...columns.map((c) => c.total)));
  const plot = BASELINE - TOP;
  const y = (value: number) => BASELINE - (value / ceiling) * plot;
  const ticks = [0, ceiling / 2, ceiling];
  // Only the tallest column is labelled: a number on every column is noise.
  const peak = columns.reduce((best, c, i) => (c.total > columns[best].total ? i : best), 0);
  const labelStep = Math.ceil(bands / 12);

  return (
    <figure className="min-w-0 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
      <figcaption className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          {currency} revenue
        </span>
        <span className="text-base font-semibold tabular-nums text-[var(--text-primary)]">
          {formatMoney(total, currency)}
        </span>
      </figcaption>

      <svg
        role="img"
        aria-label={`Finalized ${currency} revenue by month. Highest month: ${monthLabel(
          columns[peak].month,
        )} at ${formatMoney(columns[peak].total, currency)}.`}
        width="100%"
        height={HEIGHT}
        className="block w-full"
      >
        <title>{`Finalized ${currency} revenue by month`}</title>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1="0"
              x2="100%"
              y1={y(tick)}
              y2={y(tick)}
              className={
                tick === 0
                  ? "stroke-[var(--border-default)]"
                  : "stroke-[var(--border-subtle)]"
              }
              strokeWidth={1}
            />
            <text
              x="0"
              y={y(tick) - 5}
              className="fill-[var(--text-tertiary)] text-2xs tabular-nums"
            >
              {axisMoney(tick, currency)}
            </text>
          </g>
        ))}

        {columns.map((column, index) => {
          const height = column.total > 0 ? Math.max(3, BASELINE - y(column.total)) : 0;
          const topY = BASELINE - height;
          // The lower segment is everything not outstanding -- paid invoices
          // plus deposits applied to sent ones -- so the bar's split matches
          // the outstanding figure the table and Stat tile show.
          const settled = column.total - column.outstanding;
          const split = settled > 0.005 && column.outstanding > 0.005;
          const paidHeight = split
            ? Math.min(Math.max((settled / column.total) * height, CORNER), height - GAP - 2)
            : 0;
          const fill = column.outstanding > 0.005 ? "var(--warning)" : "var(--accent)";
          const offset = -barWidth / 2;

          return (
            <svg
              key={column.month}
              x={`${index * bandPercent}%`}
              y={0}
              width={`${bandPercent}%`}
              height={HEIGHT}
              overflow="visible"
            >
              {height > 0 && (
                <g>
                  <title>
                    {`${monthLabel(column.month)} — ${formatMoney(column.total, currency)} invoiced, ${formatMoney(column.paid, currency)} paid`}
                  </title>
                  {/* Rounded data-end, square at the baseline: the rx rect
                      supplies the top, the plain rect squares the bottom. */}
                  <rect
                    x="50%"
                    transform={`translate(${offset} 0)`}
                    y={topY}
                    width={barWidth}
                    height={height}
                    rx={CORNER}
                    fill={fill}
                  />
                  {height > CORNER && (
                    <rect
                      x="50%"
                      transform={`translate(${offset} 0)`}
                      y={topY + CORNER}
                      width={barWidth}
                      height={height - CORNER}
                      fill={fill}
                    />
                  )}
                  {split && (
                    <>
                      <rect
                        x="50%"
                        transform={`translate(${offset} 0)`}
                        y={BASELINE - paidHeight}
                        width={barWidth}
                        height={paidHeight}
                        fill="var(--accent)"
                      />
                      {/* Surface, not a stroke, does the separating. */}
                      <rect
                        x="50%"
                        transform={`translate(${offset} 0)`}
                        y={BASELINE - paidHeight - GAP}
                        width={barWidth}
                        height={GAP}
                        fill="var(--bg-panel)"
                      />
                    </>
                  )}
                </g>
              )}

              {index === peak && column.total > 0 && (
                <text
                  x="50%"
                  y={topY - 7}
                  textAnchor="middle"
                  className="fill-[var(--text-secondary)] text-2xs font-medium tabular-nums"
                >
                  {axisMoney(column.total, currency)}
                </text>
              )}

              {index % labelStep === 0 && (
                <text
                  x="50%"
                  y={HEIGHT - 6}
                  textAnchor="middle"
                  // Twelve month labels do not fit across a 326px panel, so
                  // every other one is dropped until there is room for them.
                  className={cn(
                    "fill-[var(--text-tertiary)] text-2xs",
                    bands > 8 && index % 2 === 1 && "hidden sm:block",
                  )}
                >
                  {monthLabel(column.month).slice(0, 3)}
                </text>
              )}
            </svg>
          );
        })}
      </svg>
    </figure>
  );
}

export function RevenueChart({
  rows,
  months,
  rangeLabel,
}: {
  rows: RevenueRow[];
  /** Every `YYYY-MM` in the selected range, so empty months are visible gaps. */
  months: string[];
  rangeLabel: string;
}) {
  const currencies = [...new Set(rows.map((row) => row.currency))].sort();
  if (currencies.length === 0 || months.length === 0) return null;

  const panels = currencies.map((currency) => {
    const columns: Column[] = months.map((month) => {
      const matching = rows.filter((row) => row.currency === currency && row.month === month);
      const total = matching.reduce((sum, row) => sum + row.total, 0);
      const paid = matching.reduce((sum, row) => sum + row.paid_total, 0);
      // Deposits applied to sent invoices are already in hand, so they come
      // off "outstanding" -- the same netting as summariseRevenue's Stat tile.
      const deposits = matching.reduce((sum, row) => sum + row.sent_deposit_applied, 0);
      return {
        month,
        total: Math.round(total * 100) / 100,
        paid: Math.round(paid * 100) / 100,
        outstanding: Math.round((total - paid - deposits) * 100) / 100,
      };
    });
    return {
      currency,
      columns,
      total: Math.round(columns.reduce((sum, c) => sum + c.total, 0) * 100) / 100,
    };
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {/* Two series, so a legend is always present -- identity never rests on
            colour alone, and both values are in the table underneath. */}
        <span className="flex items-center gap-1.5 text-2xs text-[var(--text-secondary)]">
          <span
            className="size-2.5 rounded-[2px] bg-[var(--accent)]"
            aria-hidden="true"
          />
          Paid
        </span>
        <span className="flex items-center gap-1.5 text-2xs text-[var(--text-secondary)]">
          <span
            className="size-2.5 rounded-[2px] bg-[var(--warning)]"
            aria-hidden="true"
          />
          Outstanding
        </span>
        <span className="text-2xs text-[var(--text-tertiary)]">
          Finalized invoices only · {rangeLabel}
        </span>
      </div>

      <div
        className={
          panels.length > 1
            ? "grid gap-3 grid-cols-[minmax(0,1fr)] lg:grid-cols-2"
            : "grid gap-3 grid-cols-[minmax(0,1fr)]"
        }
      >
        {panels.map((panel) => (
          <CurrencyPanel
            key={panel.currency}
            currency={panel.currency}
            columns={panel.columns}
            total={panel.total}
          />
        ))}
      </div>
    </div>
  );
}
