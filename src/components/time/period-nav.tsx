"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton, Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/field";
import { Segmented } from "@/components/ui/toggles";
import { containsToday, shiftPeriod, type Period, type PeriodView } from "./period";
import { today } from "@/lib/format";
import type { TimeProject } from "@/lib/data/time";

/**
 * Week/month switch, period stepper, and the project filter, all written into
 * the URL so a period is linkable and the back button steps through it.
 *
 * Switching week→month keeps the anchor rather than jumping to today, so you
 * stay looking at the same stretch of time you were already reading.
 */
export function PeriodNav({
  period,
  projects,
  projectSlug,
}: {
  period: Period;
  /** Omitted on the project tab, where the scope is already fixed. */
  projects?: TimeProject[];
  projectSlug?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const push = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const step = (direction: -1 | 1) => {
    const next = shiftPeriod(period, direction);
    push({ view: next.view, anchor: next.anchor });
  };

  const isNow = containsToday(period);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented<PeriodView>
        label="Period length"
        value={period.view}
        onChange={(view) => push({ view, anchor: period.anchor })}
        options={[
          { value: "week", label: "Week" },
          { value: "month", label: "Month" },
        ]}
      />

      <div className="flex items-center gap-0.5">
        <IconButton
          label="Previous period"
          variant="ghost"
          size="sm"
          onClick={() => step(-1)}
        >
          <ChevronLeft />
        </IconButton>
        <span className="min-w-28 text-center text-xs sm:min-w-36 font-medium tabular-nums text-[var(--text-primary)]">
          {period.label}
        </span>
        <IconButton label="Next period" variant="ghost" size="sm" onClick={() => step(1)}>
          <ChevronRight />
        </IconButton>
      </div>

      <Button
        variant="ghost"
        size="sm"
        disabled={isNow}
        onClick={() => push({ view: period.view, anchor: today() })}
      >
        Today
      </Button>

      {projects && (
        <NativeSelect
          aria-label="Filter by project"
          value={projectSlug ?? ""}
          onChange={(event) => push({ project: event.target.value || null })}
          className="h-7 w-auto max-w-52 py-0 text-xs"
        >
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.slug}>
              {project.name}
            </option>
          ))}
        </NativeSelect>
      )}
    </div>
  );
}
