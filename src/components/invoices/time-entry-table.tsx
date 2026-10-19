import { Clock, Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { formatDate, formatHours } from "@/lib/format";
import type { InvoiceTimeEntryRow } from "@/lib/data/invoices";

/**
 * The time behind the invoice, for reference only.
 *
 * On a draft these are the entries finalizing would sweep up; on a finalized
 * invoice they are the entries it locked, and the lock icon says so. Editing
 * happens in `/app/time`, never here — a locked entry cannot be edited at all
 * (enforced by a trigger), so offering the affordance would be a lie.
 */
export function TimeEntryTable({
  entries,
  draft,
}: {
  entries: InvoiceTimeEntryRow[];
  draft: boolean;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        compact
        icon={Clock}
        title={draft ? "No unbilled time in this period" : "No time entries attached"}
        description={
          draft
            ? "Nothing in the period is waiting to be billed. Ad-hoc lines can still be added by hand."
            : "This invoice locked no time entries — a retainer period with no logged work does this."
        }
      />
    );
  }

  const worked = entries.reduce((sum, entry) => sum + entry.hours_worked, 0);
  const billed = entries.reduce((sum, entry) => sum + entry.hours_billed, 0);
  const gap = Math.round((worked - billed) * 100) / 100;

  return (
    <>
      <Table label="Time entries on this invoice">
        <THead>
          <tr>
            <TH className="hidden w-28 sm:table-cell">Date</TH>
            <TH>Work</TH>
            <TH numeric className="w-20">Worked</TH>
            <TH numeric className="w-20">Billed</TH>
          </tr>
        </THead>
        <TBody>
          {entries.map((entry) => {
            const entryGap = Math.round((entry.hours_worked - entry.hours_billed) * 100) / 100;
            return (
              <TR key={entry.id}>
                <TD className="hidden whitespace-nowrap tabular-nums sm:table-cell">
                  <span className="flex items-center gap-1.5">
                    {entry.locked && (
                      <Tooltip content="Locked to this invoice">
                        <Lock className="size-3 shrink-0 text-[var(--text-tertiary)]" />
                      </Tooltip>
                    )}
                    {formatDate(entry.date)}
                  </span>
                </TD>
                <TD>
                  <p className="max-w-[10.5rem] truncate text-[var(--text-primary)] sm:max-w-[24rem]">
                    <span className="tabular-nums text-[var(--text-tertiary)] sm:hidden">
                      {formatDate(entry.date)}
                      <span aria-hidden="true"> · </span>
                    </span>
                    {entry.description?.trim() || "Development work"}
                  </p>
                  {(entry.work_item_title || entryGap > 0) && (
                    <p className="max-w-[10.5rem] truncate text-2xs text-[var(--text-tertiary)] sm:max-w-[24rem]">
                      {entry.work_item_title}
                      {entry.work_item_title && entryGap > 0 && " · "}
                      {entryGap > 0 && (
                        <span className="text-[var(--warning-text)]">
                          −{formatHours(entryGap)}
                          {entry.discount_reason ? ` ${entry.discount_reason}` : " goodwill"}
                        </span>
                      )}
                    </p>
                  )}
                </TD>
                <TD numeric>{formatHours(entry.hours_worked)}</TD>
                <TD numeric className="text-[var(--text-primary)]">
                  {formatHours(entry.hours_billed)}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <div className="flex items-center justify-end gap-6 border-t border-[var(--border-subtle)] px-3 py-2 text-xs tabular-nums">
        <span className="text-[var(--text-tertiary)]">
          {entries.length} entr{entries.length === 1 ? "y" : "ies"}
        </span>
        {gap > 0 && (
          <span className="text-[var(--warning-text)]">−{formatHours(gap)} goodwill</span>
        )}
        <span className="text-[var(--text-tertiary)]">
          Worked <span className="text-[var(--text-secondary)]">{formatHours(worked)}</span>
        </span>
        <span className="text-[var(--text-tertiary)]">
          Billed <span className="text-[var(--text-primary)]">{formatHours(billed)}</span>
        </span>
      </div>
    </>
  );
}
