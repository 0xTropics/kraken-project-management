"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Clock, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Modal, SheetContent } from "@/components/ui/modal";
import { Badge, TypeIcon, WORK_ITEM_STATUS_META } from "@/components/ui/badge";
import { Markdown } from "@/components/notes/markdown";
import { RequestImages } from "@/components/requests/request-images";
import { formatDateTime, formatHours } from "@/lib/format";
import type { MilestoneOption, WorkItemNote, WorkItemRow } from "@/lib/data/work-items";
import type { WorkItemRequest } from "@/lib/data/client-requests";
import { ItemFields, Row } from "./item-fields";
import type { Patch } from "./store";

/**
 * A right-hand sheet rather than a modal: the board stays visible behind it, so
 * moving between items does not feel like leaving the page. The open item is
 * reflected in the URL (`?item=<id>`), so a panel can be linked to.
 */
export function DetailPanel({
  item,
  milestones,
  notes,
  request,
  onPatch,
  onClose,
}: {
  item: WorkItemRow | null;
  milestones: MilestoneOption[];
  notes: WorkItemNote[];
  request: WorkItemRequest | null;
  onPatch: (id: string, patch: Patch) => void;
  onClose: () => void;
}) {
  const [description, setDescription] = React.useState(item?.description ?? "");
  const [editingDescription, setEditingDescription] = React.useState(false);

  return (
    <Modal open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {item && (
          <>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-4">
              <TypeIcon type={item.type} />
              <Dialog.Title className="sr-only">{item.title}</Dialog.Title>
              <span className="text-2xs uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
                {WORK_ITEM_STATUS_META[item.status].label}
              </span>
              <Dialog.Close asChild>
                <IconButton label="Close" variant="ghost" size="sm" className="ml-auto">
                  <X />
                </IconButton>
              </Dialog.Close>
            </header>

            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <input
                defaultValue={item.title}
                key={item.id}
                aria-label="Title"
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value && value !== item.title) onPatch(item.id, { title: value });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                className="-mx-1.5 w-[calc(100%+0.75rem)] rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1.5 py-1 text-lg font-semibold leading-snug text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus:border-[var(--accent)] focus:bg-[var(--bg-panel)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
              />

              <ItemFields
                value={item}
                milestones={milestones}
                onChange={(patch) => onPatch(item.id, patch)}
              >
                {(item.hours_worked > 0 || item.time_entry_count > 0) && (
                  <Row label="Time">
                    <span className="flex items-center gap-1.5 text-sm tabular-nums text-[var(--text-secondary)]">
                      <Clock className="size-3.5 text-[var(--text-tertiary)]" />
                      {formatHours(item.hours_worked)} worked ·{" "}
                      {formatHours(item.hours_billed)} billed
                    </span>
                  </Row>
                )}
              </ItemFields>

              <section className="mt-6">
                <h3 className="mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                  Description
                </h3>
                {editingDescription ? (
                  <div className="space-y-2">
                    <Textarea
                      value={description}
                      autoFocus
                      rows={8}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Markdown is supported."
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onPatch(item.id, { description: description || null });
                          setEditingDescription(false);
                        }}
                        className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--accent-on)]"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDescription(item.description ?? "");
                          setEditingDescription(false);
                        }}
                        className="rounded-[var(--radius-sm)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingDescription(true)}
                    className="-mx-2 block w-[calc(100%+1rem)] rounded-[var(--radius-md)] px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]"
                  >
                    {item.description ? (
                      <Markdown content={item.description} className="text-sm" />
                    ) : (
                      <span className="text-sm text-[var(--text-tertiary)]">
                        Add a description…
                      </span>
                    )}
                  </button>
                )}
              </section>

              {request && (
                <section className="mt-6">
                  <h3 className="mb-2 text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                    From a client request
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {request.requester_name} · {formatDateTime(request.created_at)} ·{" "}
                    <a
                      href={`/app/requests?request=${request.request_id}`}
                      className="text-[var(--accent-text)] underline underline-offset-2"
                    >
                      View request
                    </a>
                  </p>
                  <RequestImages request={request} className="mt-2" />
                </section>
              )}

              <section className="mt-6">
                <h3 className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                  Progress notes
                  {notes.length > 0 && (
                    <span className="rounded-full bg-[var(--bg-inset)] px-1.5 tracking-normal">
                      {notes.length}
                    </span>
                  )}
                </h3>
                {notes.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)]">
                    No notes are attached to this item yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {notes.map((note) => (
                      <li
                        key={note.id}
                        className={cn(
                          "rounded-[var(--radius-md)] border p-3",
                          note.approved_at
                            ? "border-[var(--border-subtle)]"
                            : "border-[var(--border-subtle)] border-l-2 border-l-[var(--border-strong)] bg-[var(--bg-sunken)]",
                        )}
                      >
                        <div className="mb-1.5 flex items-center gap-2 text-2xs text-[var(--text-tertiary)]">
                          {formatDateTime(note.created_at)}
                          {note.approved_at ? (
                            <Badge tone="success">Approved</Badge>
                          ) : (
                            <Badge tone="neutral">Internal only</Badge>
                          )}
                        </div>
                        <Markdown content={note.body} className="text-sm" />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Modal>
  );
}
