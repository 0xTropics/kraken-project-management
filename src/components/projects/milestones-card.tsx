"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck,
  CircleDashed,
  Eye,
  EyeOff,
  Flag,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ConfirmDialog, Modal, ModalContent } from "@/components/ui/modal";
import { Switch } from "@/components/ui/toggles";
import { Tooltip } from "@/components/ui/tooltip";
import { api, run } from "@/lib/client-api";
import { formatDate, today } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { MilestoneWithProgress } from "@/lib/data/projects";
import type { MilestoneStatus } from "@/lib/db/types";

interface Draft {
  id: string | null;
  name: string;
  target_date: string;
  status: MilestoneStatus;
  client_visible: boolean;
}

const BLANK: Draft = { id: null, name: "", target_date: "", status: "open", client_visible: true };

/**
 * Milestones with the only progress signal that matters: how many of the work
 * items pointed at them are done. Created and edited from a modal — a milestone
 * is a small enough record that an inline row editor would cost more than it
 * saves.
 */
export function MilestonesCard({
  projectId,
  projectSlug,
  milestones,
}: {
  projectId: string;
  projectSlug: string;
  milestones: MilestoneWithProgress[];
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<MilestoneWithProgress | null>(null);
  const [busy, startBusy] = React.useTransition();
  const now = today();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const body = {
      name: draft.name.trim(),
      target_date: draft.target_date === "" ? null : draft.target_date,
      status: draft.status,
      client_visible: draft.client_visible,
    };
    startBusy(async () => {
      const result = await run(
        draft.id
          ? api(`/api/internal/milestones/${draft.id}`, { method: "PATCH", body })
          : api("/api/internal/milestones", { method: "POST", body: { ...body, project_id: projectId } }),
        {
          success: draft.id ? "Milestone updated." : "Milestone added.",
          error: "Could not save that milestone",
        },
      );
      if (result !== null) {
        setDraft(null);
        router.refresh();
      }
    });
  }

  async function setStatus(milestone: MilestoneWithProgress, status: MilestoneStatus) {
    const result = await run(
      api(`/api/internal/milestones/${milestone.id}`, { method: "PATCH", body: { status } }),
      { success: status === "done" ? "Milestone closed." : "Milestone reopened.", error: "Could not update that milestone" },
    );
    if (result !== null) router.refresh();
  }

  async function setVisible(milestone: MilestoneWithProgress, client_visible: boolean) {
    const result = await run(
      api(`/api/internal/milestones/${milestone.id}`, { method: "PATCH", body: { client_visible } }),
      {
        success: client_visible ? "Shown in the portal." : "Hidden from the portal.",
        error: "Could not update that milestone",
      },
    );
    if (result !== null) router.refresh();
  }

  function remove() {
    if (!confirmDelete) return;
    startBusy(async () => {
      const result = await run(
        api(`/api/internal/milestones/${confirmDelete.id}`, { method: "DELETE" }),
        { success: "Milestone deleted.", error: "Could not delete that milestone" },
      );
      if (result !== null) {
        setConfirmDelete(null);
        router.refresh();
      }
    });
  }

  return (
    <section aria-labelledby="milestones-heading">
      <SectionTitle
        className="mb-3"
        count={milestones.length}
        action={
          <Button variant="ghost" size="sm" onClick={() => setDraft({ ...BLANK })}>
            <Plus />
            Add
          </Button>
        }
      >
        <span id="milestones-heading">Milestones</span>
      </SectionTitle>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
        {milestones.length === 0 ? (
          <EmptyState
            compact
            icon={Flag}
            title="No milestones"
            description="Group work items under a target the client can watch move."
            action={
              <Button variant="secondary" size="sm" onClick={() => setDraft({ ...BLANK })}>
                <Plus />
                Add a milestone
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {milestones.map((milestone) => {
              const done = milestone.status === "done";
              const percent =
                milestone.items_total > 0
                  ? Math.round((milestone.items_done / milestone.items_total) * 100)
                  : done
                    ? 100
                    : 0;
              const overdue =
                !done && milestone.target_date !== null && milestone.target_date < now;
              return (
                <li key={milestone.id} className="group px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      title={done ? "Reopen this milestone" : "Mark this milestone done"}
                      aria-label={done ? "Reopen this milestone" : "Mark this milestone done"}
                      onClick={() => setStatus(milestone, done ? "open" : "done")}
                      className="mt-0.5 shrink-0"
                    >
                      {done ? (
                        <CircleCheck className="size-4 text-[var(--success)]" />
                      ) : (
                        <CircleDashed className="size-4 text-[var(--text-tertiary)] transition-colors hover:text-[var(--success)]" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-base font-medium text-[var(--text-primary)]",
                          done && "text-[var(--text-tertiary)] line-through",
                        )}
                      >
                        {milestone.name}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-2xs text-[var(--text-tertiary)]">
                        <span className="tabular-nums">
                          {milestone.items_done} of {milestone.items_total} item
                          {milestone.items_total === 1 ? "" : "s"}
                        </span>
                        {milestone.target_date && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className={cn("tabular-nums", overdue && "text-[var(--warning)]")}>
                              {overdue ? "overdue " : "due "}
                              {formatDate(milestone.target_date)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Tooltip
                        content={
                          milestone.client_visible
                            ? "Visible in the client portal"
                            : "Hidden from the client portal"
                        }
                      >
                        <button
                          type="button"
                          aria-label={
                            milestone.client_visible ? "Hide from the portal" : "Show in the portal"
                          }
                          onClick={() => setVisible(milestone, !milestone.client_visible)}
                          className="grid size-6 place-items-center rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)]"
                        >
                          {milestone.client_visible ? (
                            <Eye className="size-3.5 text-[var(--accent-text)]" />
                          ) : (
                            <EyeOff className="size-3.5 text-[var(--text-tertiary)]" />
                          )}
                        </button>
                      </Tooltip>
                      <Menu>
                        <MenuTrigger asChild>
                          <IconButton
                            label="Milestone actions"
                            variant="ghost"
                            size="xs"
                            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                          >
                            <MoreHorizontal />
                          </IconButton>
                        </MenuTrigger>
                        <MenuContent align="end">
                          <MenuItem
                            onSelect={() =>
                              setDraft({
                                id: milestone.id,
                                name: milestone.name,
                                target_date: milestone.target_date ?? "",
                                status: milestone.status,
                                client_visible: milestone.client_visible,
                              })
                            }
                          >
                            <Pencil />
                            Edit
                          </MenuItem>
                          <MenuItem onSelect={() => setStatus(milestone, done ? "open" : "done")}>
                            <CircleCheck />
                            {done ? "Reopen" : "Mark done"}
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem destructive onSelect={() => setConfirmDelete(milestone)}>
                            <Trash2 />
                            Delete
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--bg-inset)]"
                      role="img"
                      aria-label={`${percent}% of items done`}
                    >
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-300",
                          done ? "bg-[var(--success)]" : "bg-[var(--accent)]",
                        )}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right text-2xs tabular-nums text-[var(--text-tertiary)]">
                      {percent}%
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {milestones.length > 0 && (
        <p className="mt-2 text-2xs text-[var(--text-tertiary)]">
          Percentages count work items assigned to each milestone on the{" "}
          <a
            href={`/app/projects/${projectSlug}/items`}
            className="text-[var(--accent-text)] underline underline-offset-2 decoration-[color-mix(in_srgb,var(--accent-text)_40%,transparent)] hover:decoration-[var(--accent-text)]"
          >
            work items
          </a>{" "}
          tab.
        </p>
      )}

      {/* Create / edit -------------------------------------------------- */}
      <Modal open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <ModalContent
          title={draft?.id ? "Edit milestone" : "New milestone"}
          description="A milestone groups work items under one target the client can follow."
          size="sm"
        >
          {draft && (
            <form onSubmit={submit} className="space-y-4 pb-4">
              <Field label="Name" htmlFor="milestone_name" required>
                <Input
                  id="milestone_name"
                  value={draft.name}
                  autoFocus
                  required
                  maxLength={160}
                  placeholder="Beta launch"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </Field>
              <div className="grid gap-4 grid-cols-[minmax(0,1fr)] sm:grid-cols-2">
                <Field label="Target date" htmlFor="milestone_date">
                  <Input
                    id="milestone_date"
                    type="date"
                    value={draft.target_date}
                    onChange={(event) => setDraft({ ...draft, target_date: event.target.value })}
                  />
                </Field>
                <Field label="Status" htmlFor="milestone_status">
                  <NativeSelect
                    id="milestone_status"
                    value={draft.status}
                    onChange={(event) =>
                      setDraft({ ...draft, status: event.target.value as MilestoneStatus })
                    }
                  >
                    <option value="open">Open</option>
                    <option value="done">Done</option>
                  </NativeSelect>
                </Field>
              </div>
              <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2.5">
                <Switch
                  checked={draft.client_visible}
                  onCheckedChange={(checked) => setDraft({ ...draft, client_visible: checked })}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-[var(--text-secondary)]">
                    Visible in the client portal
                  </span>
                  <span className="block text-xs text-[var(--text-tertiary)]">
                    Turn off for internal-only milestones such as a refactor.
                  </span>
                </span>
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="md" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}
                  {draft.id ? "Save changes" : "Add milestone"}
                </Button>
              </div>
            </form>
          )}
        </ModalContent>
      </Modal>

      {/* Delete --------------------------------------------------------- */}
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Delete this milestone?"
        description={
          confirmDelete
            ? `"${confirmDelete.name}" will be removed. Its ${confirmDelete.items_total} work item${confirmDelete.items_total === 1 ? "" : "s"} stay, unassigned.`
            : undefined
        }
        confirmLabel="Delete milestone"
        busy={busy}
        onConfirm={remove}
      >
        <p className="pb-2 text-sm text-[var(--text-secondary)]">This cannot be undone.</p>
      </ConfirmDialog>
    </section>
  );
}
