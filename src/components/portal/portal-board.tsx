import { CircleCheck, CircleDashed, CircleDot } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PortalBoardColumn } from "@/lib/portal/derive";
import { PortalCard } from "./portal-card";

/**
 * The client's three columns.
 *
 * `relative` on each scroller is load-bearing, not decoration: an absolutely
 * positioned descendant of an unpositioned scroll container resolves against
 * the initial containing block, and Tailwind's `sr-only` is
 * `position: absolute`. That is how 1149px was once added to the project tabs.
 *
 * The columns only scroll from `lg`. Below that they stack and the document
 * scrolls -- `check:responsive` fails a page that owns a layout scroller and
 * also scrolls the document, and a phone cannot honour both.
 *
 * Each scroller carries `tabIndex={0}` so a keyboard-only client can reach it
 * at all -- axe's `scrollable-region-focusable`. It gets its own `aria-label`
 * rather than relying on the enclosing `<section>`'s: once a plain `div`
 * becomes tab-stoppable it is exposed to the accessibility tree as a region
 * of its own, and an unnamed one is a second violation.
 */

const COLUMN_ICON = {
  planned: CircleDashed,
  in_progress: CircleDot,
  done: CircleCheck,
} as const;

const COLUMN_TONE = {
  planned: "text-[var(--accent)]",
  in_progress: "text-[var(--warning)]",
  done: "text-[var(--success)]",
} as const;

const EMPTY_COPY = {
  planned: "Nothing queued up right now.",
  in_progress: "Nothing being worked on right now.",
  done: "Nothing delivered yet.",
} as const;

/**
 * In progress leads on mobile -- what is happening now beats the queue.
 * `buildBoard` returns columns in `PORTAL_VISIBLE_STATUSES` order
 * (Planned, In progress, Done) and its tests assert that order, so the
 * reorder happens here, visually, rather than in the array: below `lg` the In
 * progress column moves first; at `lg` and up this is a no-op and the DOM
 * order (Planned, In progress, Done) governs.
 */
const COLUMN_ORDER = {
  planned: "",
  in_progress: "order-first lg:order-none",
  done: "",
} as const;

export function PortalBoard({ columns }: { columns: PortalBoardColumn[] }) {
  return (
    <>
      {columns.map((column) => {
        const Icon = COLUMN_ICON[column.status];
        return (
          <section
            key={column.status}
            aria-label={column.label}
            className={cn(
              "flex min-h-0 flex-col rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-inset)]",
              COLUMN_ORDER[column.status],
            )}
          >
            <header className="flex shrink-0 items-center gap-2 px-4 pb-3 pt-3.5">
              <Icon aria-hidden="true" className={`size-3.5 ${COLUMN_TONE[column.status]}`} />
              <h2 className="flex-1 text-sm font-medium text-[var(--text-primary)]">
                {column.label}
              </h2>
              <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
                {column.items.length}
              </span>
            </header>

            {column.items.length === 0 ? (
              <p className="px-4 pb-5 text-sm text-[var(--text-tertiary)] lg:grid lg:flex-1 lg:place-items-center lg:px-6 lg:text-center">
                {EMPTY_COPY[column.status]}
              </p>
            ) : (
              <div
                tabIndex={0}
                aria-label={`${column.label} items`}
                className="scroll-thin relative flex flex-col gap-2 px-3 pb-3.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
              >
                {column.items.map((item) => (
                  <PortalCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
