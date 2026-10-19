import { addDays, endOfMonth, monthLabel, startOfMonth, today } from "@/lib/format";

/**
 * Week/month period maths for the time views. Pure string arithmetic on
 * `YYYY-MM-DD` -- `date` columns arrive as strings and are never turned into a
 * `Date` in the server's zone, so a Sunday entry cannot slide into Saturday for
 * anyone west of UTC.
 *
 * Lives under `components/` rather than `lib/data/` because both the server
 * pages and the client views need it, and `lib/data/time.ts` imports the
 * database client.
 */

export type PeriodView = "week" | "month";

export interface Period {
  view: PeriodView;
  /** Inclusive `YYYY-MM-DD`. */
  start: string;
  /** Inclusive `YYYY-MM-DD`. */
  end: string;
  /** A date inside the period; what the URL carries. */
  anchor: string;
  /** "1 – 7 Sep 2026" or "September 2026". */
  label: string;
}

function utc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** ISO weeks start on Monday. */
export function startOfWeek(date: string): string {
  const day = utc(date).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export function endOfWeek(date: string): string {
  return addDays(startOfWeek(date), 6);
}

export function isPeriodView(value: unknown): value is PeriodView {
  return value === "week" || value === "month";
}

export function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function rangeLabel(start: string, end: string): string {
  const from = utc(start);
  const to = utc(end);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const day = (d: Date) => String(d.getUTCDate());
  const monthYear = (d: Date) =>
    d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  const monthOnly = (d: Date) =>
    d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  if (sameMonth) return `${day(from)}–${day(to)} ${monthYear(to)}`;
  if (start.slice(0, 4) === end.slice(0, 4)) {
    return `${day(from)} ${monthOnly(from)} – ${day(to)} ${monthYear(to)}`;
  }
  return `${day(from)} ${monthYear(from)} – ${day(to)} ${monthYear(to)}`;
}

export function resolvePeriod(view: PeriodView, anchor: string): Period {
  const start = view === "week" ? startOfWeek(anchor) : startOfMonth(anchor);
  const end = view === "week" ? endOfWeek(anchor) : endOfMonth(anchor);
  return {
    view,
    start,
    end,
    anchor,
    label: view === "week" ? rangeLabel(start, end) : monthLabel(anchor.slice(0, 7)),
  };
}

/** The previous or next period of the same kind. */
export function shiftPeriod(period: Period, direction: -1 | 1): Period {
  if (period.view === "week") {
    return resolvePeriod("week", addDays(period.start, direction * 7));
  }
  // One day either side of the month lands in the neighbouring month, whatever
  // its length, so February and December need no special case.
  return resolvePeriod(
    "month",
    startOfMonth(direction === 1 ? addDays(period.end, 1) : addDays(period.start, -1)),
  );
}

/** True when `today` falls inside the period -- the "Today" button's disabled state. */
export function containsToday(period: Period, now = today()): boolean {
  return now >= period.start && now <= period.end;
}

/** Every `YYYY-MM` between two dates, inclusive. Drives the report columns. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let cursor = startOfMonth(from);
  // A five-year custom range is 60 columns; anything beyond that is a mistake,
  // not a report, so the loop is bounded rather than trusting the input.
  while (cursor <= to && months.length < 60) {
    months.push(cursor.slice(0, 7));
    cursor = startOfMonth(addDays(endOfMonth(cursor), 1));
  }
  return months;
}

/** Weekday + day, for the date group headers: "Mon 31 Aug". */
export function formatDayHeading(date: string): string {
  return utc(date).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
