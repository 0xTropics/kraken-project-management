import { Bug, Sparkles, Wrench } from "lucide-react";
import type { PortalWorkItem } from "@/lib/data/portal";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * One item on the client's board.
 *
 * A fix and a feature are the same shape deliberately: a client should watch a
 * bug move through the same columns as everything else rather than find it in a
 * list of its own. What distinguishes them is the icon, a tinted border while
 * the fix is open, and the date line -- "Fixed" against "Delivered".
 */
export function PortalCard({ item }: { item: PortalWorkItem }) {
  const isFix = item.type === "bug";
  // The same three glyphs the internal board uses (WORK_ITEM_TYPE_META), so an
  // item looks like itself on both sides of the password.
  const Icon = isFix ? Bug : item.type === "chore" ? Wrench : Sparkles;
  // What the Done column calls it. A chore is neither delivered nor fixed.
  const doneVerb = isFix ? "Fixed" : item.type === "chore" ? "Done" : "Delivered";

  return (
    <article
      className={cn(
        "rounded-[var(--radius-lg)] border bg-[var(--bg-raised)] px-3.5 py-3",
        item.status === "done"
          ? "border-[var(--border-subtle)] bg-[var(--bg-panel)]"
          : isFix
            ? "border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
            : item.status === "in_progress"
              ? "border-[color-mix(in_srgb,var(--warning)_35%,transparent)]"
              : "border-[var(--border-subtle)]",
      )}
    >
      <div className="flex gap-2.5">
        <Icon
          aria-hidden="true"
          className={cn(
            "mt-1 size-3.5 shrink-0",
            isFix ? "text-[var(--danger)]" : "text-[var(--text-tertiary)]",
          )}
        />
        <div className="min-w-0">
          <h3
            className={cn(
              "text-base leading-[1.35rem]",
              item.status === "done" ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]",
            )}
          >
            {item.title}
          </h3>

          {item.description && item.status !== "done" && (
            <p className="mt-1 text-sm leading-[1.2rem] text-[var(--text-secondary)]">
              {item.description}
            </p>
          )}

          {item.status === "done" && item.completed_at && (
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              {doneVerb} {formatDate(String(item.completed_at).slice(0, 10))}
            </p>
          )}

          {isFix && item.status !== "done" && (
            // Solid fill, not the `-subtle`/`-text` tint pair the other status
            // badges use: at 15% alpha over `--bg-raised` in dark mode,
            // `--danger-text` measures ~4.36:1, under the 4.5:1 AA floor for
            // text this size. `--danger`/`--danger-on` is the pairing already
            // designed for text on a solid danger fill, and it clears AA on
            // every surface this card sits on -- opaque, so it does not
            // depend on which background is behind the card.
            <span className="mt-1.5 inline-flex items-center rounded-full bg-[var(--danger)] px-2 py-0.5 text-2xs font-medium text-[var(--danger-on)]">
              Fix
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
