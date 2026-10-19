"use client";

import * as React from "react";
import { NativeSelect } from "@/components/ui/field";
import { Switch } from "@/components/ui/toggles";
import { PRIORITY_META, WORK_ITEM_STATUS_META, WORK_ITEM_TYPE_META } from "@/components/ui/badge";
import { WORK_ITEM_PRIORITIES, WORK_ITEM_STATUSES, WORK_ITEM_TYPES } from "@/lib/db/types";
import type { MilestoneOption, WorkItemRow } from "@/lib/data/work-items";
import type { Patch } from "./store";

/**
 * The attribute rows shared by the detail panel and the create dialog, so the
 * thing you fill in looks like the thing you will later edit. `children` are
 * extra rows appended inside the same list.
 */
export function ItemFields({
  value,
  milestones,
  onChange,
  children,
}: {
  value: Pick<WorkItemRow, "status" | "priority" | "type" | "milestone_id" | "client_visible">;
  milestones: MilestoneOption[];
  onChange: (patch: Patch) => void;
  children?: React.ReactNode;
}) {
  return (
    <dl className="mt-4 space-y-2.5">
      <Row label="Status">
        <NativeSelect
          value={value.status}
          onChange={(e) => onChange({ status: e.target.value as WorkItemRow["status"] })}
          aria-label="Status"
          className="h-7 text-sm"
        >
          {WORK_ITEM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {WORK_ITEM_STATUS_META[s].label}
            </option>
          ))}
        </NativeSelect>
      </Row>
      <Row label="Priority">
        <NativeSelect
          value={value.priority}
          onChange={(e) => onChange({ priority: e.target.value as WorkItemRow["priority"] })}
          aria-label="Priority"
          className="h-7 text-sm"
        >
          {WORK_ITEM_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_META[p].label}
            </option>
          ))}
        </NativeSelect>
      </Row>
      <Row label="Type">
        <NativeSelect
          value={value.type}
          onChange={(e) => onChange({ type: e.target.value as WorkItemRow["type"] })}
          aria-label="Type"
          className="h-7 text-sm"
        >
          {WORK_ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {WORK_ITEM_TYPE_META[t].label}
            </option>
          ))}
        </NativeSelect>
      </Row>
      <Row label="Milestone">
        <NativeSelect
          value={value.milestone_id ?? ""}
          onChange={(e) => onChange({ milestone_id: e.target.value || null })}
          aria-label="Milestone"
          className="h-7 text-sm"
        >
          <option value="">No milestone</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
      </Row>
      <Row label="Client can see it">
        <div className="flex items-center gap-2">
          <Switch
            checked={value.client_visible}
            onCheckedChange={(checked) => onChange({ client_visible: checked })}
            aria-label="Visible in the client portal"
          />
          <span className="text-xs text-[var(--text-tertiary)]">
            {value.client_visible ? "Shown in the portal" : "Internal only"}
          </span>
        </div>
      </Row>
      {children}
    </dl>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2">
      <dt className="text-xs text-[var(--text-tertiary)]">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
