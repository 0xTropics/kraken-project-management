import { NotepadText } from "lucide-react";
import type { PortalUpdate } from "@/lib/data/portal";
import { formatDate } from "@/lib/format";
import { Markdown } from "@/components/notes/markdown";

/**
 * The rail beside the board. Same scroll rules as a column: `relative`, and it
 * only scrolls from `lg`, and `tabIndex={0}` plus its own `aria-label` so it
 * is both keyboard-reachable and named once it is a tab stop in its own right
 * (axe's `scrollable-region-focusable`).
 *
 * Month grouping is gone with the old feed. At rail width a ruled month label
 * costs a line for every month and buys nothing a date on each entry does not
 * already say.
 */
export function PortalUpdates({ updates }: { updates: PortalUpdate[] }) {
  return (
    <section
      aria-label="Recent updates"
      className="flex min-h-0 flex-col rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-panel)]"
    >
      <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-[var(--border-subtle)] px-4 pb-3 pt-4">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.09em] text-[var(--text-tertiary)]">
          Recent updates
        </h2>
        {updates.length > 0 && (
          <span className="text-xs tabular-nums text-[var(--text-tertiary)]">{updates.length}</span>
        )}
      </header>

      {updates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-8 text-center lg:flex-1 lg:justify-center">
          <NotepadText aria-hidden="true" className="size-5 text-[var(--text-tertiary)]" />
          <p className="max-w-[26ch] text-sm text-[var(--text-secondary)]">
            Progress notes will appear here as work lands.
          </p>
        </div>
      ) : (
        <div
          tabIndex={0}
          aria-label="Recent updates list"
          className="scroll-thin relative flex flex-col gap-5 px-4 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
        >
          {updates.map((update) => (
            <article key={update.id}>
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <time
                  dateTime={String(update.created_at)}
                  className="text-sm tabular-nums text-[var(--text-tertiary)]"
                >
                  {formatDate(String(update.created_at).slice(0, 10))}
                </time>
                {update.work_item_title && (
                  <span className="text-sm text-[var(--text-tertiary)]">
                    {update.work_item_title}
                  </span>
                )}
              </div>
              <div className="mt-1 text-base leading-[1.35rem] text-[var(--text-primary)]">
                <Markdown content={update.body} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
