import type { TimeEntryRow } from "@/lib/data/time";

/**
 * Worked / billed / gap, summed in one place.
 *
 * Deliberately not in `time-view.tsx`: that module is `"use client"`, and a
 * plain function exported from a client module cannot be *called* on the
 * server, only rendered. Both the server pages and the client table need this
 * arithmetic, so it lives in a module neither directive touches.
 */
export interface TimeTotals {
  worked: number;
  billed: number;
  gap: number;
}

export function sumEntries(entries: TimeEntryRow[]): TimeTotals {
  const worked = entries.reduce((sum, entry) => sum + entry.hours_worked, 0);
  const billed = entries.reduce((sum, entry) => sum + entry.hours_billed, 0);
  return {
    worked: Math.round(worked * 100) / 100,
    billed: Math.round(billed * 100) / 100,
    gap: Math.round((worked - billed) * 100) / 100,
  };
}
