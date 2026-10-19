"use client";

import * as React from "react";
import { Clock, MessageSquare, Eye } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  PriorityDot,
  TypeIcon,
  WORK_ITEM_STATUS_META,
} from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { QuickAdd } from "./quick-add";
import { ItemMenu } from "./item-menu";
import { WORK_ITEM_STATUSES, type WorkItemStatus } from "@/lib/db/types";
import { formatHours } from "@/lib/format";
import type { MilestoneOption, WorkItemRow } from "@/lib/data/work-items";
import type { Patch } from "./store";

/**
 * Board view. Columns are 320px with a 16px gutter and cards carry 12px of
 * padding, matching Plane's measured density.
 *
 * Drag and drop uses the native HTML5 API rather than a library: the only
 * gesture is "card into column", the drop target is a whole column, and a
 * dependency for that would be more code than the twenty lines below.
 */
export function Board({
  items,
  milestones,
  onPatch,
  onMove,
  onCreate,
  onExpandCreate,
  onDelete,
  onOpen,
  openId,
}: {
  items: WorkItemRow[];
  milestones: MilestoneOption[];
  onPatch: (id: string, patch: Patch) => void;
  onMove: (id: string, status: WorkItemStatus, orderedIds: string[]) => void;
  onCreate: (input: { title: string; type: WorkItemRow["type"]; status?: WorkItemStatus }) => Promise<unknown>;
  /** Opens the full create form, carrying the column's status so the item lands here. */
  onExpandCreate: (draft: {
    title: string;
    type: WorkItemRow["type"];
    status?: WorkItemStatus;
  }) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  openId: string | null;
}) {
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<WorkItemStatus | null>(null);

  const columns = React.useMemo(
    () =>
      WORK_ITEM_STATUSES.map((status) => ({
        status,
        meta: WORK_ITEM_STATUS_META[status],
        items: items.filter((item) => item.status === status),
      })),
    [items],
  );

  function drop(status: WorkItemStatus) {
    setOver(null);
    const id = dragging;
    setDragging(null);
    if (!id) return;
    const item = items.find((i) => i.id === id);
    if (!item || item.status === status) return;
    const ordered = [...items.filter((i) => i.status === status).map((i) => i.id), id];
    onMove(id, status, ordered);
  }

  return (
    <div className="scroll-thin flex h-full min-h-0 gap-4 overflow-x-auto px-4 pb-4 md:px-6">
      {columns.map((column) => (
        <section
          key={column.status}
          aria-label={column.meta.label}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(column.status);
          }}
          onDragLeave={() => setOver((s) => (s === column.status ? null : s))}
          onDrop={() => drop(column.status)}
          className={cn(
            // 320px, not Plane's 350px. Their cards carry an assignee avatar,
            // labels, a due date, a sub-issue count and an issue key; Kraken's
            // carry a title, a milestone chip and hours. At 350
            // the cards read sparse and a sixth of a column is lost at 1440px.
            "flex w-80 shrink-0 flex-col rounded-[var(--radius-lg)] transition-colors duration-100",
            over === column.status && dragging
              ? "bg-[var(--accent-subtle)] ring-1 ring-inset ring-[var(--accent)]"
              : "bg-[var(--bg-sunken)]",
          )}
        >
          <header className="sticky top-0 z-[1] flex items-center gap-2 rounded-t-[var(--radius-lg)] bg-inherit px-3 py-2.5">
            <column.meta.Icon
              className={cn(
                "size-4 shrink-0",
                column.status === "done" && "text-[var(--success)]",
                column.status === "in_progress" && "text-[var(--warning)]",
                column.status === "planned" && "text-[var(--info)]",
                (column.status === "backlog" || column.status === "wont_do") &&
                  "text-[var(--text-tertiary)]",
              )}
            />
            <h3 className="truncate text-xs font-semibold text-[var(--text-primary)]">
              {column.meta.label}
            </h3>
            <span className="ml-auto text-2xs tabular-nums text-[var(--text-tertiary)]">
              {column.items.length}
            </span>
          </header>

          <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-2 pb-2">
            {column.items.map((item) => (
              <article
                key={item.id}
                draggable
                onDragStart={() => setDragging(item.id)}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                onClick={() => onOpen(item.id)}
                className={cn(
                  "reserve-outline group cursor-pointer rounded-[var(--radius-md)] border bg-[var(--bg-panel)] p-3",
                  "shadow-[var(--shadow-card)] transition-[border-color,box-shadow,opacity] duration-100",
                  "hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-raised)]",
                  openId === item.id
                    ? "border-[var(--accent)]"
                    : "border-[var(--border-subtle)]",
                  dragging === item.id && "opacity-40",
                )}
              >
                <div className="flex items-start gap-2">
                  <TypeIcon type={item.type} className="mt-0.5 shrink-0" />
                  {/* The card is clickable for convenience, but the title is
                      the real control: a card with role="button" wrapping the
                      actions menu would be a nested interactive element. */}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(item.id);
                    }}
                    className="min-w-0 flex-1 text-left text-base font-medium leading-snug text-[var(--text-primary)]"
                  >
                    {item.title}
                  </button>
                  <ItemMenu
                    item={item}
                    milestones={milestones}
                    onPatch={(patch) => onPatch(item.id, patch)}
                    onDelete={() => onDelete(item.id)}
                    className="-mr-1 -mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                  />
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-2xs text-[var(--text-tertiary)]">
                  <PriorityDot priority={item.priority} />
                  {item.milestone_name && (
                    <span className="max-w-[9rem] truncate rounded-[var(--radius-xs)] bg-[var(--bg-inset)] px-1.5 py-px">
                      {item.milestone_name}
                    </span>
                  )}
                  {item.hours_worked > 0 && (
                    <Tooltip content={`${formatHours(item.hours_worked)} logged`}>
                      <span className="flex items-center gap-1 tabular-nums">
                        <Clock className="size-3" />
                        {formatHours(item.hours_worked)}
                      </span>
                    </Tooltip>
                  )}
                  {item.note_count > 0 && (
                    <span className="flex items-center gap-1 tabular-nums">
                      <MessageSquare className="size-3" />
                      {item.note_count}
                    </span>
                  )}
                  {item.client_visible && (
                    <Tooltip content="Visible in the client portal">
                      <Eye className="size-3 text-[var(--accent-text)]" />
                    </Tooltip>
                  )}
                </div>
              </article>
            ))}

            <QuickAdd
              compact
              status={column.status}
              onCreate={onCreate}
              onExpand={onExpandCreate}
              placeholder="Add…"
            />
          </div>
        </section>
      ))}
    </div>
  );
}
