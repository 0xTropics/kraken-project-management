"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { PRESET_LABELS, RANGE_PRESETS, presetRange, type ResolvedRange } from "./range";

/**
 * One filter row above everything it scopes (never a filter per card): both
 * reports and both exports read the same `from`/`to` out of the URL, so what
 * you export is always exactly what you are looking at.
 */
export function RangePicker({ range }: { range: ResolvedRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const push = React.useCallback(
    (from: string, to: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("from", from);
      next.set("to", to);
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const exportHref = (type: "revenue" | "utilization") =>
    `/api/internal/reports/export?type=${type}&from=${range.from}&to=${range.to}`;

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {RANGE_PRESETS.map((preset) => {
          const active = range.preset === preset;
          if (preset === "custom") {
            // Not a button: "Custom" is a state you land in by editing a date,
            // not an action, and a chip that does nothing when clicked is worse
            // than no chip at all.
            return active ? (
              <span
                key={preset}
                className="inline-flex h-7 items-center rounded-[var(--radius-md)] border border-[var(--accent)] bg-[var(--accent-subtle)] px-2.5 text-xs font-medium text-[var(--accent-text)]"
              >
                {PRESET_LABELS.custom}
              </span>
            ) : null;
          }
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              onClick={() => {
                const next = presetRange(preset);
                push(next.from, next.to);
              }}
              className={cn(
                "inline-flex h-7 items-center rounded-[var(--radius-md)] border px-2.5",
                "text-xs font-medium transition-colors duration-100",
                active
                  ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                  : "border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
              )}
            >
              {PRESET_LABELS[preset]}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <label htmlFor="range-from" className="text-2xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          From
        </label>
        <Input
          id="range-from"
          type="date"
          value={range.from}
          max={range.to}
          onChange={(event) => event.target.value && push(event.target.value, range.to)}
          className="h-7 w-36 px-2 text-xs"
        />
        <label htmlFor="range-to" className="text-2xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          To
        </label>
        <Input
          id="range-to"
          type="date"
          value={range.to}
          min={range.from}
          onChange={(event) => event.target.value && push(range.from, event.target.value)}
          className="h-7 w-36 px-2 text-xs"
        />
      </div>

      <div className="flex items-center gap-1.5 md:ml-auto">
        <Button asChild variant="secondary" size="sm">
          <a href={exportHref("revenue")} download>
            <Download />
            Revenue CSV
          </a>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <a href={exportHref("utilization")} download>
            <Download />
            Utilization CSV
          </a>
        </Button>
      </div>
    </div>
  );
}
