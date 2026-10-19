"use client";

import * as React from "react";
import { ChevronDown, Clock, Eye, MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import { PriorityDot, TypeIcon, WORK_ITEM_STATUS_META } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/toggles";
import { InlineInput } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { ItemMenu } from "./item-menu";
import { QuickAdd } from "./quick-add";
import { WORK_ITEM_STATUSES, type WorkItemStatus } from "@/lib/db/types";
import { formatHours, formatRelative } from "@/lib/format";
import type { MilestoneOption, WorkItemRow } from "@/lib/data/work-items";
import type { Patch } from "./store";

/** 44px rows grouped by status, matching Plane's list density. */
export function ItemList({
  items,
  milestones,
  selected,
  onToggleSelect,
  onPatch,
  onCreate,
  onDelete,
  onOpen,
  openId,
}: {
  items: WorkItemRow[];
  milestones: MilestoneOption[];
  selected: Set<string>;
  onToggleSelect: (id: string, index: number, shiftKey: boolean) => void;
  onPatch: (id: string, patch: Patch) => void;
  onCreate: (input: { title: string; type: WorkItemRow["type"]; status?: WorkItemStatus }) => Promise<unknown>;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  openId: string | null;
}) {
  const [collapsed, setCollapsed] = React.useState<Set<WorkItemStatus>>(new Set());
  const [editing, setEditing] = React.useState<string | null>(null);

  const groups = WORK_ITEM_STATUSES.map((status) => ({
    status,
    meta: WORK_ITEM_STATUS_META[status],
    rows: items.filter((item) => item.status === status),
  })).filter((group) => group.rows.length > 0 || group.status === "backlog");

  // Flat index across visible rows, so shift-click ranges cross group borders.
  const flat = groups.flatMap((group) =>
    collapsed.has(group.status) ? [] : group.rows.map((r) => r.id),
  );

  return (
    <div className="mx-auto max-w-[80rem] px-4 pb-10 md:px-6">
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.status);
        return (
          <section key={group.status} className="mb-1">
            <button
              type="button"
              aria-expanded={!isCollapsed}
              onClick={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(group.status)) next.delete(group.status);
                  else next.add(group.status);
                  return next;
                })
              }
              className="sticky top-12 z-[1] flex h-9 w-full items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]/95 px-1 backdrop-blur-sm"
            >
              <ChevronDown
                className={cn(
                  "size-3.5 text-[var(--text-tertiary)] transition-transform duration-150",
                  isCollapsed && "-rotate-90",
                )}
              />
              <group.meta.Icon
                className={cn(
                  "size-4",
                  group.status === "done" && "text-[var(--success)]",
                  group.status === "in_progress" && "text-[var(--warning)]",
                  group.status === "planned" && "text-[var(--info)]",
                )}
              />
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                {group.meta.label}
              </span>
              <span className="rounded-full bg-[var(--bg-inset)] px-1.5 text-2xs tabular-nums text-[var(--text-secondary)]">
                {group.rows.length}
              </span>
            </button>

            {!isCollapsed && (
              <ul>
                {group.rows.map((item) => {
                  const index = flat.indexOf(item.id);
                  const isSelected = selected.has(item.id);
                  return (
                    <li
                      key={item.id}
                      onClick={() => onOpen(item.id)}
                      className={cn(
                        "reserve-outline group flex min-h-11 cursor-pointer items-center gap-2.5 border-b border-[var(--border-subtle)] py-2 pl-1 pr-1 transition-colors duration-75",
                        isSelected
                          ? "bg-[var(--bg-selected)]"
                          : openId === item.id
                            ? "bg-[var(--bg-hover)]"
                            : "hover:bg-[var(--bg-hover)]",
                      )}
                    >
                      <span
                        onClick={(event) => event.stopPropagation()}
                        className="flex w-5 shrink-0 justify-center"
                      >
                        <Checkbox
                          checked={isSelected}
                          onClick={(event) =>
                            onToggleSelect(item.id, index, (event as React.MouseEvent).shiftKey)
                          }
                          aria-label={`Select ${item.title}`}
                          className={cn(
                            "transition-opacity",
                            !isSelected && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                          )}
                        />
                      </span>

                      <span className="flex w-4 shrink-0 justify-center">
                        <TypeIcon type={item.type} />
                      </span>

                      <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
                        {editing === item.id ? (
                          <InlineInput
                            defaultValue={item.title}
                            autoFocus
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (value && value !== item.title) onPatch(item.id, { title: value });
                              setEditing(null);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.currentTarget.blur();
                              if (event.key === "Escape") setEditing(null);
                            }}
                            className="text-base"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpen(item.id)}
                            onDoubleClick={() => setEditing(item.id)}
                            className="block w-full truncate text-left text-base text-[var(--text-primary)]"
                            title="Click to open, double-click to rename"
                          >
                            {item.title}
                          </button>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2 text-2xs text-[var(--text-tertiary)]">
                        {item.milestone_name && (
                          <span className="hidden max-w-[8rem] truncate rounded-[var(--radius-xs)] bg-[var(--bg-inset)] px-1.5 py-0.5 lg:block">
                            {item.milestone_name}
                          </span>
                        )}
                        {item.hours_worked > 0 && (
                          <span className="hidden items-center gap-1 tabular-nums sm:flex">
                            <Clock className="size-3" />
                            {formatHours(item.hours_worked)}
                          </span>
                        )}
                        {item.note_count > 0 && (
                          <span className="hidden items-center gap-1 tabular-nums md:flex">
                            <MessageSquare className="size-3" />
                            {item.note_count}
                          </span>
                        )}
                        {item.client_visible && (
                          <Tooltip content="Visible in the client portal">
                            <Eye className="size-3 text-[var(--accent-text)]" />
                          </Tooltip>
                        )}
                        <PriorityDot priority={item.priority} />
                        <span className="hidden w-20 text-right tabular-nums xl:block">
                          {formatRelative(item.updated_at)}
                        </span>
                        <span onClick={(event) => event.stopPropagation()}>
                          <ItemMenu
                            item={item}
                            milestones={milestones}
                            onPatch={(patch) => onPatch(item.id, patch)}
                            onDelete={() => onDelete(item.id)}
                            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                          />
                        </span>
                      </div>
                    </li>
                  );
                })}
                {group.status === "backlog" && (
                  <li className="border-b border-[var(--border-subtle)]">
                    <QuickAdd status="backlog" onCreate={onCreate} placeholder="Add to backlog…" />
                  </li>
                )}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
