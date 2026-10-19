"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalClose, ModalContent } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/field";
import {
  defaultClientVisible,
  type WorkItemPriority,
  type WorkItemStatus,
  type WorkItemType,
} from "@/lib/db/types";
import type { MilestoneOption } from "@/lib/data/work-items";
import { ItemFields } from "./item-fields";

/** What an entry point can pre-fill. Everything else takes its default. */
export interface NewItemDraft {
  title?: string;
  type?: WorkItemType;
  status?: WorkItemStatus;
}

export interface NewItemInput {
  title: string;
  type: WorkItemType;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  milestone_id: string | null;
  client_visible: boolean;
  description?: string;
}

/**
 * The full create form. `QuickAdd` deliberately asks two questions, because a
 * capture box that asks seven stops being used -- but the create endpoint has
 * always accepted all seven, and there was no way to reach the other five
 * except by creating an item and then editing it. This is that way.
 *
 * The fields and their order mirror the detail panel, so the thing you fill in
 * looks like the thing you will later edit.
 */
export function NewItemDialog({
  open,
  onOpenChange,
  milestones,
  draft,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestones: MilestoneOption[];
  draft?: NewItemDraft;
  onCreate: (input: NewItemInput) => Promise<unknown>;
}) {
  // Remount rather than reset. The form seeds its state from `draft` at mount,
  // so a fresh key is the whole reset -- no effect writing state on open, which
  // is both a lint error here and a cascading render.
  const key = `${open}|${draft?.title ?? ""}|${draft?.type ?? ""}|${draft?.status ?? ""}`;
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <NewItemForm
        key={key}
        draft={draft}
        milestones={milestones}
        onCreate={onCreate}
        onDone={() => onOpenChange(false)}
      />
    </Modal>
  );
}

function NewItemForm({
  draft,
  milestones,
  onCreate,
  onDone,
}: {
  draft?: NewItemDraft;
  milestones: MilestoneOption[];
  onCreate: (input: NewItemInput) => Promise<unknown>;
  onDone: () => void;
}) {
  const [title, setTitle] = React.useState(draft?.title ?? "");
  // `client_visible` here is the operator's override, null until they touch it:
  // visibility follows the server's own rule until then, so the toggle can never
  // show something the server would not have chosen. `defaultClientVisible` is
  // the exact function `createWorkItem` applies.
  const [fields, setFields] = React.useState({
    type: draft?.type ?? ("feature" as WorkItemType),
    status: draft?.status ?? ("backlog" as WorkItemStatus),
    priority: "medium" as WorkItemPriority,
    milestone_id: null as string | null,
    client_visible: null as boolean | null,
  });
  const [description, setDescription] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const clientVisible = fields.client_visible ?? defaultClientVisible(fields.type, fields.status);

  const trimmed = title.trim();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || pending) return;
    startTransition(async () => {
      const created = await onCreate({
        title: trimmed,
        type: fields.type,
        status: fields.status,
        priority: fields.priority,
        milestone_id: fields.milestone_id,
        client_visible: clientVisible,
        description: description.trim() || undefined,
      });
      if (created) onDone();
    });
  }

  return (
    <ModalContent
      title="New work item"
      description="Everything here can be changed later."
      footer={
        <>
          <ModalClose asChild>
            <Button variant="ghost" size="sm" type="button">
              Cancel
            </Button>
          </ModalClose>
          <Button
            type="submit"
            form="new-work-item"
            variant="primary"
            size="sm"
            disabled={!trimmed || pending}
          >
            {pending ? <Loader2 className="animate-spin" /> : <Plus />}
            Create item
          </Button>
        </>
      }
    >
      <form id="new-work-item" onSubmit={submit} className="pb-2">
        <label className="block">
          <span className="text-xs text-[var(--text-tertiary)]">Title</span>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs doing?"
            maxLength={300}
            autoFocus
            required
            className="mt-1"
          />
        </label>

        <ItemFields
          value={{ ...fields, client_visible: clientVisible }}
          milestones={milestones}
          onChange={(patch) => setFields((current) => ({ ...current, ...patch }))}
        />

        <label className="mt-4 block">
          <span className="text-xs text-[var(--text-tertiary)]">Description</span>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            placeholder="Optional. Markdown is rendered in the portal."
            className="mt-1"
          />
        </label>
      </form>
    </ModalContent>
  );
}
