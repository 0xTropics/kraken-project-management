"use client";

import * as React from "react";
import { Eye, EyeOff, MoreHorizontal, Trash2 } from "lucide-react";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuTrigger,
} from "@/components/ui/menu";
import { IconButton } from "@/components/ui/button";
import { PRIORITY_META, WORK_ITEM_STATUS_META, WORK_ITEM_TYPE_META } from "@/components/ui/badge";
import { WORK_ITEM_PRIORITIES, WORK_ITEM_STATUSES, WORK_ITEM_TYPES } from "@/lib/db/types";
import type { MilestoneOption, WorkItemRow } from "@/lib/data/work-items";
import type { Patch } from "./store";

/** Every attribute of an item, reachable without leaving the row. */
export function ItemMenu({
  item,
  milestones,
  onPatch,
  onDelete,
  className,
}: {
  item: WorkItemRow;
  milestones: MilestoneOption[];
  onPatch: (patch: Patch) => void;
  onDelete: () => void;
  className?: string;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton
          label="Item actions"
          variant="ghost"
          size="sm"
          className={className}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <MenuSub label="Status">
          <MenuRadioGroup
            value={item.status}
            onValueChange={(status) => onPatch({ status: status as WorkItemRow["status"] })}
          >
            {WORK_ITEM_STATUSES.map((status) => {
              const meta = WORK_ITEM_STATUS_META[status];
              return (
                <MenuRadioItem key={status} value={status}>
                  <meta.Icon />
                  {meta.label}
                </MenuRadioItem>
              );
            })}
          </MenuRadioGroup>
        </MenuSub>

        <MenuSub label="Priority">
          <MenuRadioGroup
            value={item.priority}
            onValueChange={(priority) =>
              onPatch({ priority: priority as WorkItemRow["priority"] })
            }
          >
            {WORK_ITEM_PRIORITIES.map((priority) => (
              <MenuRadioItem key={priority} value={priority}>
                <span
                  className={`inline-block size-1.5 rounded-full ${PRIORITY_META[priority].dot}`}
                />
                {PRIORITY_META[priority].label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuSub>

        <MenuSub label="Type">
          <MenuRadioGroup
            value={item.type}
            onValueChange={(type) => onPatch({ type: type as WorkItemRow["type"] })}
          >
            {WORK_ITEM_TYPES.map((type) => {
              const meta = WORK_ITEM_TYPE_META[type];
              return (
                <MenuRadioItem key={type} value={type}>
                  <meta.Icon />
                  {meta.label}
                </MenuRadioItem>
              );
            })}
          </MenuRadioGroup>
        </MenuSub>

        <MenuSub label="Milestone">
          <MenuRadioGroup
            value={item.milestone_id ?? "none"}
            onValueChange={(value) =>
              onPatch({ milestone_id: value === "none" ? null : value })
            }
          >
            <MenuRadioItem value="none">No milestone</MenuRadioItem>
            {milestones.map((milestone) => (
              <MenuRadioItem key={milestone.id} value={milestone.id}>
                {milestone.name}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuSub>

        <MenuSeparator />
        <MenuLabel>Client portal</MenuLabel>
        <MenuItem onSelect={() => onPatch({ client_visible: !item.client_visible })}>
          {item.client_visible ? <EyeOff /> : <Eye />}
          {item.client_visible ? "Hide from the client" : "Show to the client"}
        </MenuItem>

        <MenuSeparator />
        <MenuItem destructive onSelect={onDelete}>
          <Trash2 />
          Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
