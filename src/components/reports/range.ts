import { addDays, endOfMonth, formatDate, monthLabel, startOfMonth, today } from "@/lib/format";
import type { ReportRange } from "@/lib/data/reports";

/**
 * Report date ranges. Pure `YYYY-MM-DD` string arithmetic, like the period
 * helpers -- a `date` column is a string and turning it into a `Date` in the
 * server's zone is how a quarter loses its first day.
 *
 * The URL carries `from` and `to` only. The preset is derived by matching them,
 * so a shared link always reproduces exactly the range the sender saw, and a
 * hand-edited date simply lands on "Custom".
 */

export const RANGE_PRESETS = [
  "this-month",
  "last-month",
  "this-quarter",
  "this-year",
  "custom",
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

export const PRESET_LABELS: Record<RangePreset, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "this-quarter": "This quarter",
  "this-year": "This year",
  custom: "Custom",
};

/** First and last month of the calendar quarter containing `date`, as `YYYY-MM-01`. */
function quarterMonths(date: string): { first: string; last: string } {
  const year = date.slice(0, 4);
  const month = Number(date.slice(5, 7));
  const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { first: `${year}-${pad(firstMonth)}-01`, last: `${year}-${pad(firstMonth + 2)}-01` };
}

export function presetRange(preset: Exclude<RangePreset, "custom">, now = today()): ReportRange {
  switch (preset) {
    case "this-month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "last-month": {
      const previous = addDays(startOfMonth(now), -1);
      return { from: startOfMonth(previous), to: endOfMonth(previous) };
    }
    case "this-quarter": {
      const { first, last } = quarterMonths(now);
      return { from: first, to: endOfMonth(last) };
    }
    case "this-year":
      return { from: `${now.slice(0, 4)}-01-01`, to: `${now.slice(0, 4)}-12-31` };
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ResolvedRange extends ReportRange {
  preset: RangePreset;
  label: string;
}

/** Reads the URL, falling back to this year — the range the reports open on. */
export function resolveRange(
  params: { from?: string; to?: string },
  now = today(),
): ResolvedRange {
  const fallback = presetRange("this-year", now);
  let from = params.from && DATE.test(params.from) ? params.from : fallback.from;
  let to = params.to && DATE.test(params.to) ? params.to : fallback.to;
  if (from > to) [from, to] = [to, from];

  const preset =
    RANGE_PRESETS.filter((p): p is Exclude<RangePreset, "custom"> => p !== "custom").find((p) => {
      const candidate = presetRange(p, now);
      return candidate.from === from && candidate.to === to;
    }) ?? "custom";

  return { from, to, preset, label: rangeLabel(from, to) };
}

/** "September 2026" when the range is exactly a month, else "1 Jan – 30 Sep 2026". */
export function rangeLabel(from: string, to: string): string {
  if (from === startOfMonth(from) && to === endOfMonth(to)) {
    if (from.slice(0, 7) === to.slice(0, 7)) return monthLabel(from.slice(0, 7));
    if (from.slice(0, 4) === to.slice(0, 4) && from.endsWith("-01-01") && to.endsWith("-12-31")) {
      return from.slice(0, 4);
    }
  }
  return `${formatDate(from)} – ${formatDate(to)}`;
}
