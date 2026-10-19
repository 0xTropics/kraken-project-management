import { addDays, formatDate, fromCents, toCents } from "@/lib/format";
import type { DateString, MaintenanceTerm } from "@/lib/db/types";

/**
 * Maintenance term arithmetic. Pure -- no database imports -- so the engine,
 * the data layer and the UI share one definition of "the next term" and one
 * of what it costs.
 *
 * Terms are whole calendar months. `maintenance_starts_on` is constrained to
 * the 1st, and every term this module produces ends on a month's last day, so
 * the day after any coverage is always a 1st.
 */

/** One live maintenance invoice's period: coverage is a set of these, not a date. */
export interface CoveredPeriod {
  start: DateString;
  end: DateString;
}

export interface MaintenancePricing {
  maintenance_monthly: number;
  maintenance_price_6: number | null;
  maintenance_price_12: number | null;
}

export interface TermPeriod {
  start: DateString;
  end: DateString;
  /** Usually the project's term; fewer when the term is capped to fill a gap. */
  months: number;
}

export interface MaintenanceLine {
  kind: "maintenance";
  description: string;
  quantity: number;
  unit: number;
}

/** The last day of the month `months - 1` after `start`'s month. */
export function termEnd(start: DateString, months: number): DateString {
  const [y, m] = start.split("-").map(Number);
  // Day 0 of a month is the last day of the month before it.
  return new Date(Date.UTC(y, m - 1 + months, 0)).toISOString().slice(0, 10);
}

/** Whole months from one 1st to a later 1st. */
function monthsBetween(from: DateString, to: DateString): number {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/** The latest covered day, for display. Null when nothing is covered. */
export function coveredThroughOf(covered: CoveredPeriod[]): DateString | null {
  return covered.reduce<DateString | null>((latest, p) => (latest === null || p.end > latest ? p.end : latest), null);
}

/**
 * The next term to bill: the earliest month, from the start month on, that no
 * live maintenance invoice covers. Coverage is a set of periods rather than a
 * single "covered through" date because voiding a term that is not the latest
 * leaves a hole behind later coverage -- and a hole that nothing reports is a
 * month that is never billed.
 *
 * - Starting from `startsOn` is what lets a lapsed client be restarted by
 *   moving the start month forward instead of being billed for the gap.
 * - A term never runs into coverage that already exists: filling a hole is
 *   capped at the months before the next covered period, so a one-month hole
 *   on a 12-month client is billed as one month.
 */
export function nextTermPeriod(
  covered: CoveredPeriod[],
  startsOn: DateString,
  term: MaintenanceTerm,
): TermPeriod {
  let start = startsOn;
  for (;;) {
    const holder = covered.find((p) => p.start <= start && start <= p.end);
    if (!holder) break;
    start = addDays(holder.end, 1);
  }
  const following = covered
    .map((p) => p.start)
    .filter((s) => s > start)
    .sort()[0];
  const room = following === undefined ? term : Math.max(1, monthsBetween(start, following));
  const months = Math.min(term, room);
  return { start, end: termEnd(start, months), months };
}

function prepayPrice(pricing: MaintenancePricing, months: number): number | null {
  switch (months) {
    case 6:
      return pricing.maintenance_price_6;
    case 12:
      return pricing.maintenance_price_12;
    default:
      return null;
  }
}

/**
 * What a term costs before tax, in cents: the 6- or 12-month prepay price when
 * the term is exactly that long and one is set, else months × monthly.
 */
export function termPriceCents(pricing: MaintenancePricing, months: number): number {
  const price = prepayPrice(pricing, months);
  return price === null ? months * toCents(pricing.maintenance_monthly) : toCents(price);
}

function monthName(date: DateString, style: "long" | "short"): string {
  const [y, m] = date.split("-").map(Number);
  // en-US, not the en-GB `formatDate` uses: en-GB abbreviates September to
  // "Sept", which is not what a client in Canada or the US expects to read.
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: style,
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "October 2026" for one month; "Oct 2026 to Sep 2027" for a longer term. */
export function termSpanLabel(period: TermPeriod): string {
  return period.months === 1
    ? monthName(period.start, "long")
    : `${monthName(period.start, "short")} to ${monthName(period.end, "short")}`;
}

/**
 * The lines a term puts on an invoice. The full price is always shown, and a
 * prepay discount follows it as its own negative line so the client sees what
 * prepaying saved. The discount is a lower price, not a payment, so it is
 * taxable like the line it reduces -- unlike a deposit, which applies after tax.
 */
export function maintenanceLines(
  pricing: MaintenancePricing,
  period: TermPeriod,
): MaintenanceLine[] {
  const monthlyCents = toCents(pricing.maintenance_monthly);
  const discountCents = termPriceCents(pricing, period.months) - period.months * monthlyCents;
  const lines: MaintenanceLine[] = [
    {
      kind: "maintenance",
      description: `Website maintenance — ${termSpanLabel(period)}`,
      quantity: period.months,
      unit: fromCents(monthlyCents),
    },
  ];
  if (discountCents < 0) {
    lines.push({
      kind: "maintenance",
      description: `Prepay discount — ${period.months} months`,
      quantity: 1,
      unit: fromCents(discountCents),
    });
  }
  return lines;
}

export interface PrepaySaving {
  saving: number;
  /** One decimal place. */
  percent: number;
}

/** The saving a prepay price implies, for the settings form's hint. Null until both figures are usable. */
export function prepaySaving(monthly: number, price: number, months: 6 | 12): PrepaySaving | null {
  if (!(monthly > 0) || !(price > 0)) return null;
  const fullCents = months * toCents(monthly);
  const savingCents = fullCents - toCents(price);
  return {
    saving: fromCents(savingCents),
    percent: Math.round((savingCents / fullCents) * 1000) / 10,
  };
}

/** One line of status, for Renewals due and the project's maintenance panel. */
export function coverageSummary(
  coveredThrough: DateString | null,
  nextStart: DateString,
  today: DateString,
): string {
  if (coveredThrough === null) return `Starts ${formatDate(nextStart)} · nothing invoiced yet`;
  if (coveredThrough < today) return `Lapsed · covered through ${formatDate(coveredThrough)}`;
  return `Covered through ${formatDate(coveredThrough)}`;
}
