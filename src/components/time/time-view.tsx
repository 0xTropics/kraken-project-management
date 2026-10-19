"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Lock, MoreHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { HoursBar } from "@/components/dashboard/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/button";
import { InlineInput } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { api, run } from "@/lib/client-api";
import { formatHours } from "@/lib/format";
import { formatDayHeading, type Period } from "./period";
import { sumEntries, type TimeTotals } from "./totals";
import type { TimeContext, TimeEntryRow } from "@/lib/data/time";

/*
 * Column order is load-bearing. The two always-visible columns -- status and
 * description -- come first, so the day-heading row can `colSpan` across them
 * at every breakpoint. A `hidden` cell is `display:none` and drops out of the
 * table's column model, so a colSpan that crossed one would misalign the
 * subtotals on a phone.
 */

/* -------------------------------------------------------------------------- */
/* Totals                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Worked, billed, and the difference between them. The gap is the number worth
 * seeing: it is unbilled work, and it is invisible everywhere else.
 */
export function TotalsStrip({
  totals,
  label,
  className,
}: {
  totals: TimeTotals;
  label: string;
  className?: string;
}) {
  const pct = totals.worked > 0 ? Math.min(100, (totals.billed / totals.worked) * 100) : 0;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[var(--radius-lg)]",
        "border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 py-3",
        className,
      )}
    >
      <div>
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          Worked
        </p>
        <p className="mt-1 text-xl font-semibold leading-none text-[var(--text-primary)]">
          {formatHours(totals.worked)}
        </p>
      </div>
      <div>
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          Billed
        </p>
        <p className="mt-1 text-xl font-semibold leading-none text-[var(--text-primary)]">
          {formatHours(totals.billed)}
        </p>
      </div>
      <div>
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          Gap
        </p>
        <p
          className={cn(
            "mt-1 text-xl font-semibold leading-none",
            totals.gap > 0 ? "text-[var(--warning)]" : "text-[var(--text-tertiary)]",
          )}
        >
          {totals.gap > 0 ? `−${formatHours(totals.gap)}` : formatHours(0)}
        </p>
      </div>
      <div className="min-w-40 flex-1">
        <HoursBar
          worked={totals.worked}
          billed={totals.billed}
          label={`${formatHours(totals.billed)} of ${formatHours(totals.worked)} billed in ${label}`}
        />
        <p className="mt-1.5 text-2xs text-[var(--text-tertiary)]">
          {totals.worked > 0
            ? `${Math.round(pct)}% of ${label} billed`
            : `Nothing logged in ${label}`}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

type Patch = Partial<Pick<TimeEntryRow, "description" | "hours_worked" | "hours_billed">>;

/**
 * Hours inside the table are bare numbers, not `3h`. Half the cells are text
 * inputs holding the same value, and a unit that appears on the read-only half
 * and vanishes on the editable half reads as a rendering bug. The column
 * headings and the totals strip carry the unit instead.
 */
function hours(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Numeric cell that reads as text until focused. Locked rows never render it. */
function HoursCell({
  value,
  label,
  onCommit,
  tone,
}: {
  value: number;
  label: string;
  onCommit: (next: number) => void;
  tone?: "warning";
}) {
  return (
    <InlineInput
      // Re-mount on a committed change so the uncontrolled default follows the
      // server's answer instead of the stale keystroke.
      key={value}
      aria-label={label}
      defaultValue={String(value)}
      inputMode="decimal"
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = String(value);
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        const next = Number.parseFloat(event.target.value);
        if (!Number.isFinite(next) || next === value) {
          event.target.value = String(value);
          return;
        }
        onCommit(next);
      }}
      className={cn(
        "w-14 text-right text-sm tabular-nums",
        tone === "warning" ? "text-[var(--warning)]" : "text-[var(--text-primary)]",
      )}
    />
  );
}

function EntryRow({
  entry,
  showProject,
  onPatch,
  onDelete,
}: {
  entry: TimeEntryRow;
  showProject: boolean;
  onPatch: (id: string, patch: Patch) => void;
  onDelete: (id: string) => void;
}) {
  const locked = entry.invoice_id !== null;
  const gap = Math.round((entry.hours_worked - entry.hours_billed) * 100) / 100;

  return (
    <TR className="group">
      <TD className="w-8 px-2">
        {locked ? (
          <Tooltip
            content={`Locked to invoice ${entry.invoice_number ?? "—"} — void and reissue it to change this time.`}
          >
            <span className="grid size-5 place-items-center rounded-[var(--radius-xs)] bg-[var(--bg-inset)]">
              <Lock className="size-3 text-[var(--text-tertiary)]" />
              <span className="sr-only">
                Read-only: on invoice {entry.invoice_number ?? "unknown"}
              </span>
            </span>
          </Tooltip>
        ) : (
          <span className="grid size-5 place-items-center">
            <Clock className="size-3 text-[var(--text-tertiary)] opacity-70" />
          </span>
        )}
      </TD>

      {/* `max-w-0 w-full` is what makes `truncate` work in an auto-layout
          table: the cell absorbs the leftover width instead of being sized to
          its longest word, so a description cannot shove the hours off-screen
          on a phone. */}
      <TD className="w-full max-w-0 px-2 md:px-3">
        {locked ? (
          <p className="truncate text-[var(--text-secondary)]">
            {entry.description ?? (
              <span className="text-[var(--text-tertiary)]">No description</span>
            )}
          </p>
        ) : (
          <InlineInput
            key={entry.description ?? ""}
            aria-label="Description"
            defaultValue={entry.description ?? ""}
            placeholder="Add a description…"
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value = entry.description ?? "";
                event.currentTarget.blur();
              }
            }}
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (next === (entry.description ?? "")) return;
              onPatch(entry.id, { description: next || null });
            }}
            // An input clips rather than ellipsising by default, which reads as
            // a rendering fault on a narrow screen.
            className="text-sm text-ellipsis text-[var(--text-primary)]"
          />
        )}
        {/* The columns that drop away on a phone reappear as one quiet line. */}
        <p className="truncate text-2xs text-[var(--text-tertiary)] lg:hidden">
          {showProject ? entry.project_name : entry.client_name}
          {entry.work_item_title ? ` · ${entry.work_item_title}` : ""}
          {locked && ` · Invoice ${entry.invoice_number ?? "—"}`}
          {gap > 0 && <span className="text-[var(--warning)]"> · −{formatHours(gap)} billed</span>}
        </p>
      </TD>

      {showProject && (
        <TD className="hidden lg:table-cell">
          <Link
            href={`/app/projects/${entry.project_slug}/time`}
            className="block max-w-48 truncate text-[var(--text-secondary)] hover:text-[var(--accent-text)]"
          >
            {entry.project_name}
          </Link>
        </TD>
      )}

      <TD className="hidden text-[var(--text-tertiary)] xl:table-cell">
        <span className="block max-w-44 truncate">{entry.work_item_title ?? "—"}</span>
      </TD>

      <TD numeric className="w-16 px-2 md:px-3">
        {locked ? (
          <span className="text-[var(--text-primary)]">{hours(entry.hours_worked)}</span>
        ) : (
          <HoursCell
            value={entry.hours_worked}
            label={`Hours worked on ${entry.date}`}
            onCommit={(next) => onPatch(entry.id, { hours_worked: next })}
          />
        )}
      </TD>

      <TD numeric className="hidden w-16 sm:table-cell">
        {locked ? (
          <span className="text-[var(--text-secondary)]">{hours(entry.hours_billed)}</span>
        ) : (
          <HoursCell
            value={entry.hours_billed}
            label={`Hours billed on ${entry.date}`}
            tone={gap > 0 ? "warning" : undefined}
            onCommit={(next) => onPatch(entry.id, { hours_billed: next })}
          />
        )}
      </TD>

      <TD numeric className="hidden w-20 md:table-cell">
        {gap > 0 ? (
          <Tooltip content={entry.discount_reason ?? "No discount reason recorded"}>
            <span className="cursor-help text-[var(--warning)]">−{hours(gap)}</span>
          </Tooltip>
        ) : (
          <span className="text-[var(--text-tertiary)]">—</span>
        )}
      </TD>

      <TD className="w-9 px-1 text-right sm:w-20">
        {locked ? (
          <span className="hidden whitespace-nowrap pr-1 text-2xs tabular-nums text-[var(--text-tertiary)] sm:inline">
            {entry.invoice_number}
          </span>
        ) : (
          <Menu>
            <MenuTrigger asChild>
              <IconButton
                label="Entry actions"
                variant="ghost"
                size="sm"
                className="transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
              >
                <MoreHorizontal />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem destructive onSelect={() => onDelete(entry.id)}>
                <Trash2 />
                Delete entry
              </MenuItem>
            </MenuContent>
          </Menu>
        )}
      </TD>
    </TR>
  );
}

/* -------------------------------------------------------------------------- */
/* View                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The period's entries, grouped by day with a subtotal per day.
 *
 * Locked entries -- those already on a finalized invoice -- render as plain
 * text with a lock and the invoice number, and have no menu at all. The server
 * refuses the edit anyway; removing the affordance is what stops the user
 * discovering that the hard way.
 */
export function TimeView({
  entries,
  period,
  context,
  showProject = true,
  emptyAction,
}: {
  entries: TimeEntryRow[];
  period: Period;
  context: TimeContext;
  showProject?: boolean;
  emptyAction?: React.ReactNode;
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState(entries);
  const [seed, setSeed] = React.useState(entries);
  if (seed !== entries) {
    // Fresh server data wins; keeping the optimistic copy would mean two truths.
    setSeed(entries);
    setRows(entries);
  }

  const onPatch = React.useCallback(
    async (id: string, patch: Patch) => {
      const before = rows;
      setRows((current) =>
        current.map((row) => {
          if (row.id !== id) return row;
          const next = { ...row, ...patch };
          // Lowering worked hours pulls billed down with it, exactly as the
          // server does, so the optimistic row is never a lie.
          if (patch.hours_worked !== undefined) {
            next.hours_billed = Math.min(next.hours_billed, patch.hours_worked);
          }
          return next;
        }),
      );
      const saved = await run(
        api<TimeEntryRow>(`/api/internal/time-entries/${id}`, { method: "PATCH", body: patch }),
        { error: "Could not save that change" },
      );
      if (!saved) setRows(before);
      else router.refresh();
    },
    [rows, router],
  );

  const onDelete = React.useCallback(
    async (id: string) => {
      const before = rows;
      setRows((current) => current.filter((row) => row.id !== id));
      const result = await run(api(`/api/internal/time-entries/${id}`, { method: "DELETE" }), {
        success: "Entry deleted.",
        error: "Could not delete that entry",
      });
      if (result === null) setRows(before);
      else router.refresh();
    },
    [rows, router],
  );

  const days = React.useMemo(() => {
    const map = new Map<string, TimeEntryRow[]>();
    for (const row of rows) map.set(row.date, [...(map.get(row.date) ?? []), row]);
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
        <EmptyState
          icon={Clock}
          title={`No time logged in ${period.label}`}
          description={
            context.latest_date
              ? `${formatHours(context.total_worked)} is logged outside this period — the most recent entry is ${formatDayHeading(context.latest_date)}.`
              : "Nothing has been logged yet. The entry form is built for a phone."
          }
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
      <Table label={`Time entries for ${period.label}`}>
        <THead>
          <TR>
            <TH className="w-8 px-2">
              <span className="sr-only">Status</span>
            </TH>
            <TH className="w-full max-w-0 px-2 md:px-3">Description</TH>
            {showProject && <TH className="hidden lg:table-cell">Project</TH>}
            <TH className="hidden xl:table-cell">Work item</TH>
            <TH numeric className="w-16 px-2 md:px-3">
              Worked
            </TH>
            <TH numeric className="hidden w-16 sm:table-cell">
              Billed
            </TH>
            <TH numeric className="hidden w-20 md:table-cell">
              Gap
            </TH>
            <TH numeric className="w-9 px-1 sm:w-20">
              <span className="sr-only">Actions</span>
            </TH>
          </TR>
        </THead>

        {days.map(([date, dayRows]) => {
          const totals = sumEntries(dayRows);
          return (
            <TBody key={date}>
              <TR className="bg-[var(--bg-sunken)]">
                {/* Spans only the two columns that exist at every breakpoint. */}
                <TD colSpan={2} className="h-8 w-full max-w-0 px-2 md:px-3">
                  <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                    {formatDayHeading(date)}
                  </span>
                  <span className="ml-2 text-2xs text-[var(--text-tertiary)]">
                    {dayRows.length} {dayRows.length === 1 ? "entry" : "entries"}
                  </span>
                </TD>
                {showProject && <TD className="hidden h-8 lg:table-cell" />}
                <TD className="hidden h-8 xl:table-cell" />
                <TD
                  numeric
                  className="h-8 px-2 text-2xs font-semibold text-[var(--text-secondary)] md:px-3"
                >
                  {hours(totals.worked)}
                </TD>
                <TD
                  numeric
                  className="hidden h-8 text-2xs font-semibold text-[var(--text-secondary)] sm:table-cell"
                >
                  {hours(totals.billed)}
                </TD>
                <TD
                  numeric
                  className={cn(
                    "hidden h-8 text-2xs font-semibold md:table-cell",
                    totals.gap > 0 ? "text-[var(--warning)]" : "text-[var(--text-tertiary)]",
                  )}
                >
                  {totals.gap > 0 ? `−${hours(totals.gap)}` : "—"}
                </TD>
                <TD className="h-8 w-9 px-1 sm:w-20" />
              </TR>
              {dayRows.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  showProject={showProject}
                  onPatch={onPatch}
                  onDelete={onDelete}
                />
              ))}
            </TBody>
          );
        })}
      </Table>
    </div>
  );
}
