"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Columns3, ListFilter, Plus, Rows3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/toggles";
import { PRIORITY_META, WORK_ITEM_STATUS_META, WORK_ITEM_TYPE_META } from "@/components/ui/badge";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Board } from "./board";
import { ItemList } from "./list";
import { DetailPanel } from "./detail-panel";
import { NewItemDialog, type NewItemDraft } from "./new-item-dialog";
import { useWorkItems } from "./store";
import {
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_TYPES,
} from "@/lib/db/types";
import type { MilestoneOption, WorkItemNote, WorkItemRow } from "@/lib/data/work-items";
import type { WorkItemRequest } from "@/lib/data/client-requests";

type View = "board" | "list";

/** Filter state lives in the URL so a filtered view is linkable and survives a refresh. */
const FILTER_KEYS = ["type", "status", "priority", "milestone", "visible"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

/** The filter menu's three enum sections, in menu order. */
const ENUM_FILTERS: [FilterKey, string, readonly string[], Record<string, { label: string }>][] = [
  ["type", "Type", WORK_ITEM_TYPES, WORK_ITEM_TYPE_META],
  ["status", "Status", WORK_ITEM_STATUSES, WORK_ITEM_STATUS_META],
  ["priority", "Priority", WORK_ITEM_PRIORITIES, PRIORITY_META],
];

export function WorkItemsClient({
  projectId,
  initialItems,
  milestones,
  notes,
  requests,
}: {
  projectId: string;
  initialItems: WorkItemRow[];
  milestones: MilestoneOption[];
  notes: Record<string, WorkItemNote[]>;
  requests: WorkItemRequest[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { items, mutate, move, create, remove, bulk } = useWorkItems(projectId, initialItems);

  const view: View = params.get("view") === "list" ? "list" : "board";
  const openId = params.get("item");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  // Held in state rather than rebuilt inline: the dialog resets from it, so
  // a fresh object each render would reset the form on every keystroke.
  const [newOpen, setNewOpen] = React.useState(false);
  const [newDraft, setNewDraft] = React.useState<NewItemDraft | undefined>(undefined);
  const lastIndex = React.useRef<number | null>(null);

  const setParam = React.useCallback(
    (updates: Record<string, string | string[] | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        next.delete(key);
        if (Array.isArray(value)) for (const v of value) next.append(key, v);
        else if (value !== null) next.set(key, value);
      }
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const active = React.useMemo(() => {
    const map = {} as Record<FilterKey, string[]>;
    for (const key of FILTER_KEYS) map[key] = params.getAll(key);
    return map;
  }, [params]);

  const filtered = React.useMemo(() => {
    return items.filter((item) => {
      if (active.type.length && !active.type.includes(item.type)) return false;
      if (active.status.length && !active.status.includes(item.status)) return false;
      if (active.priority.length && !active.priority.includes(item.priority)) return false;
      if (active.milestone.length) {
        const key = item.milestone_id ?? "none";
        if (!active.milestone.includes(key)) return false;
      }
      if (active.visible.length === 1) {
        const wants = active.visible[0] === "true";
        if (item.client_visible !== wants) return false;
      }
      return true;
    });
  }, [items, active]);

  const filterCount = FILTER_KEYS.reduce((sum, key) => sum + active[key].length, 0);

  async function bulkAndClear(action: Record<string, unknown>, successMessage: string) {
    await bulk([...selected], action, successMessage);
    setSelected(new Set());
  }

  function toggleFilter(key: FilterKey, value: string) {
    const current = active[key];
    setParam({
      [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    });
  }

  const toggleSelect = React.useCallback(
    (id: string, index: number, shiftKey: boolean) => {
      const visibleIds = filtered.map((i) => i.id);
      setSelected((current) => {
        const next = new Set(current);
        if (shiftKey && lastIndex.current !== null && index >= 0) {
          const [from, to] = [lastIndex.current, index].sort((a, b) => a - b);
          const shouldSelect = !next.has(id);
          for (let i = from; i <= to; i += 1) {
            const rowId = visibleIds[i];
            if (!rowId) continue;
            if (shouldSelect) next.add(rowId);
            else next.delete(rowId);
          }
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        lastIndex.current = index;
        return next;
      });
    },
    [filtered],
  );

  // `c` focuses the quick-add, matching Plane and Linear.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "c") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('input[aria-label="New work item title"]')?.focus();
      }
      if (event.key === "Escape") setSelected(new Set());
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openItem = openId ? (items.find((i) => i.id === openId) ?? null) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar --------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 md:px-6">
        <Segmented
          label="View"
          value={view}
          onChange={(next) => setParam({ view: next === "board" ? null : next })}
          options={[
            { value: "board", label: "Board", icon: <Columns3 /> },
            { value: "list", label: "List", icon: <Rows3 /> },
          ]}
        />

        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <ListFilter />
              Filter
              {filterCount > 0 && (
                <span className="rounded-full bg-[var(--accent-subtle)] px-1.5 text-2xs font-semibold text-[var(--accent-text)]">
                  {filterCount}
                </span>
              )}
            </Button>
          </MenuTrigger>
          <MenuContent className="max-h-[26rem] overflow-y-auto">
            {ENUM_FILTERS.map(([key, label, values, meta]) => (
              <React.Fragment key={key}>
                <MenuLabel>{label}</MenuLabel>
                {values.map((value) => (
                  <MenuCheckboxItem
                    key={value}
                    checked={active[key].includes(value)}
                    onCheckedChange={() => toggleFilter(key, value)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {meta[value].label}
                  </MenuCheckboxItem>
                ))}
                <MenuSeparator />
              </React.Fragment>
            ))}
            <MenuLabel>Client portal</MenuLabel>
            <MenuCheckboxItem
              checked={active.visible.includes("true")}
              onCheckedChange={() => toggleFilter("visible", "true")}
              onSelect={(e) => e.preventDefault()}
            >
              Visible to the client
            </MenuCheckboxItem>
            <MenuCheckboxItem
              checked={active.visible.includes("false")}
              onCheckedChange={() => toggleFilter("visible", "false")}
              onSelect={(e) => e.preventDefault()}
            >
              Internal only
            </MenuCheckboxItem>
            {milestones.length > 0 && (
              <>
                <MenuSeparator />
                <MenuLabel>Milestone</MenuLabel>
                <MenuCheckboxItem
                  checked={active.milestone.includes("none")}
                  onCheckedChange={() => toggleFilter("milestone", "none")}
                  onSelect={(e) => e.preventDefault()}
                >
                  No milestone
                </MenuCheckboxItem>
                {milestones.map((m) => (
                  <MenuCheckboxItem
                    key={m.id}
                    checked={active.milestone.includes(m.id)}
                    onCheckedChange={() => toggleFilter("milestone", m.id)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {m.name}
                  </MenuCheckboxItem>
                ))}
              </>
            )}
          </MenuContent>
        </Menu>

        {filterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTER_KEYS.flatMap((key) =>
              active[key].map((value) => (
                <button
                  key={`${key}:${value}`}
                  type="button"
                  onClick={() => toggleFilter(key, value)}
                  className="group inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--bg-inset)] px-1.5 py-0.5 text-2xs text-[var(--text-secondary)] hover:bg-[var(--bg-active)]"
                >
                  {labelFor(key, value, milestones)}
                  <X className="size-2.5 opacity-60 group-hover:opacity-100" />
                </button>
              )),
            )}
            <button
              type="button"
              onClick={() => setParam(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}
              className="text-2xs text-[var(--text-tertiary)] underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          </div>
        )}

        <span className="ml-auto text-2xs tabular-nums text-[var(--text-tertiary)]">
          {filtered.length === items.length
            ? `${items.length} items`
            : `${filtered.length} of ${items.length}`}
        </span>

        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setNewDraft(undefined);
            setNewOpen(true);
          }}
        >
          <Plus />
          New item
        </Button>
      </div>

      <NewItemDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        milestones={milestones}
        draft={newDraft}
        onCreate={create}
      />

      {/* Bulk bar -------------------------------------------------------- */}
      {selected.size > 0 && (
        <div className="mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-panel)] px-3 py-2 shadow-[var(--shadow-card)] md:mx-6">
          <span className="text-xs font-medium text-[var(--text-primary)]">
            {selected.size} selected
          </span>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" size="sm">Priority</Button>
            </MenuTrigger>
            <MenuContent>
              {WORK_ITEM_PRIORITIES.map((p) => (
                <MenuItem
                  key={p}
                  onSelect={() => bulkAndClear({ op: "priority", priority: p }, "Priority updated.")}
                >
                  {PRIORITY_META[p].label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" size="sm">Milestone</Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem
                onSelect={() => bulkAndClear({ op: "milestone", milestone_id: null }, "Milestone cleared.")}
              >
                No milestone
              </MenuItem>
              {milestones.map((m) => (
                <MenuItem
                  key={m.id}
                  onSelect={() => bulkAndClear({ op: "milestone", milestone_id: m.id }, "Milestone set.")}
                >
                  {m.name}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              bulkAndClear({ op: "client_visible", client_visible: true }, "Shown to the client.")
            }
          >
            Show to client
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              bulkAndClear({ op: "client_visible", client_visible: false }, "Hidden from the client.")
            }
          >
            Hide
          </Button>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>
            <X />
            Clear
          </Button>
        </div>
      )}

      {/* Content --------------------------------------------------------- */}
      {/* No zero-items branch. The board and list both render correctly when
          empty, and each carries the QuickAdd composer -- replacing them with a
          message removed the only way to create a first item, on every new
          project. The filtered-empty message below is gated on a filter
          actually being active, or it would claim 0 items are hidden. */}
      {filtered.length === 0 && filterCount > 0 ? (
        <EmptyState
          icon={ListFilter}
          title="Nothing matches these filters"
          description={`${items.length} items are hidden by the current filter.`}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setParam(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}
            >
              Clear filters
            </Button>
          }
        />
      ) : view === "board" ? (
        <div className="min-h-0 flex-1">
          <Board
            items={filtered}
            milestones={milestones}
            onPatch={mutate}
            onMove={move}
            onCreate={create}
            onExpandCreate={(draft) => {
              setNewDraft(draft);
              setNewOpen(true);
            }}
            onDelete={remove}
            onOpen={(id) => setParam({ item: id })}
            openId={openId}
          />
        </div>
      ) : (
        <ItemList
          items={filtered}
          milestones={milestones}
          selected={selected}
          onToggleSelect={toggleSelect}
          onPatch={mutate}
          onCreate={create}
          onDelete={remove}
          onOpen={(id) => setParam({ item: id })}
          openId={openId}
        />
      )}

      <DetailPanel
        key={openItem?.id}
        item={openItem}
        milestones={milestones}
        notes={openItem ? (notes[openItem.id] ?? []) : []}
        request={openItem ? (requests.find((r) => r.work_item_id === openItem.id) ?? null) : null}
        onPatch={mutate}
        onClose={() => setParam({ item: null })}
      />
    </div>
  );
}

function labelFor(key: FilterKey, value: string, milestones: MilestoneOption[]): string {
  switch (key) {
    case "type":
      return WORK_ITEM_TYPE_META[value as keyof typeof WORK_ITEM_TYPE_META]?.label ?? value;
    case "status":
      return WORK_ITEM_STATUS_META[value as keyof typeof WORK_ITEM_STATUS_META]?.label ?? value;
    case "priority":
      return PRIORITY_META[value as keyof typeof PRIORITY_META]?.label ?? value;
    case "visible":
      return value === "true" ? "Client-visible" : "Internal only";
    case "milestone":
      return value === "none"
        ? "No milestone"
        : (milestones.find((m) => m.id === value)?.name ?? "Milestone");
  }
}
