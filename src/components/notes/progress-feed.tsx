"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Loader2, MessageSquarePlus, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { NativeSelect, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/toggles";
import { Tooltip } from "@/components/ui/tooltip";
import { Markdown } from "@/components/notes/markdown";
import { api, run } from "@/lib/client-api";
import { formatDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { NoteWorkItemOption, ProgressNoteRow } from "@/lib/data/notes";

/**
 * The progress feed. Chronological, newest first, with the approval
 * gate on every row: a note is invisible to the client until it is approved,
 * and an unapproved card says so.
 */
export function ProgressFeed({
  projectId,
  projectSlug,
  notes,
  workItems,
}: {
  projectId: string;
  projectSlug: string;
  notes: ProgressNoteRow[];
  workItems: NoteWorkItemOption[];
}) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [workItemId, setWorkItemId] = React.useState("");
  const [approved, setApproved] = React.useState(true);
  const [posting, startPosting] = React.useTransition();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const pending = notes.filter((note) => note.approved_at === null).length;

  function post() {
    const trimmed = body.trim();
    if (trimmed === "") return;
    startPosting(async () => {
      const result = await run(
        api("/api/internal/notes/progress", {
          method: "POST",
          body: {
            project_id: projectId,
            body: trimmed,
            work_item_id: workItemId === "" ? null : workItemId,
            approved,
          },
        }),
        {
          success: approved ? "Posted — the client can see it." : "Posted, held back from the client.",
          error: "Could not post that note",
        },
      );
      if (result !== null) {
        setBody("");
        setWorkItemId("");
        router.refresh();
      }
    });
  }

  async function setNoteApproved(id: string, next: boolean) {
    setBusyId(id);
    const result = await run(
      api(`/api/internal/notes/progress/${id}`, { method: "PATCH", body: { approved: next } }),
      {
        success: next ? "Approved — visible in the portal." : "Withdrawn from the portal.",
        error: "Could not update that note",
      },
    );
    setBusyId(null);
    if (result !== null) router.refresh();
  }

  async function remove(id: string) {
    setBusyId(id);
    const result = await run(api(`/api/internal/notes/progress/${id}`, { method: "DELETE" }), {
      success: "Note deleted.",
      error: "Could not delete that note",
    });
    setBusyId(null);
    if (result !== null) router.refresh();
  }

  async function approveAll() {
    const ids = notes.filter((note) => note.approved_at === null).map((note) => note.id);
    if (ids.length === 0) return;
    const result = await run(
      api("/api/internal/notes/progress/bulk", {
        method: "POST",
        body: { ids, action: "approve" },
      }),
      { success: `Approved ${ids.length} notes.`, error: "Could not approve those notes" },
    );
    if (result !== null) router.refresh();
  }

  // Day separators are computed up front: deriving them by mutating a variable
  // mid-render would break on a re-render that starts partway through the list.
  const rows = notes.map((note, index) => ({
    note,
    showDay:
      index === 0 || note.created_at.slice(0, 10) !== notes[index - 1].created_at.slice(0, 10),
  }));

  return (
    <section aria-labelledby="progress-heading" className="min-w-0">
      <SectionTitle
        className="mb-3"
        count={notes.length}
        action={
          pending > 0 && (
            <Button variant="ghost" size="sm" onClick={approveAll}>
              <Check />
              Approve {pending}
            </Button>
          )
        }
      >
        <span id="progress-heading">Progress feed</span>
      </SectionTitle>

      {/* Composer -------------------------------------------------------- */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 focus-within:border-[var(--border-default)]">
        <Textarea
          value={body}
          rows={3}
          maxLength={20_000}
          placeholder="What moved today? Markdown works, and the client reads approved notes verbatim."
          aria-label="New progress note"
          className="border-transparent bg-transparent hover:border-transparent focus:border-transparent focus:ring-0"
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) post();
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label="Attach to a work item"
            value={workItemId}
            className="h-7 min-w-0 flex-1 basis-40 text-xs sm:basis-52"
            onChange={(event) => setWorkItemId(event.target.value)}
          >
            <option value="">No work item</option>
            {workItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </NativeSelect>

          <label className="flex items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-2xs text-[var(--text-secondary)]">
            <Switch checked={approved} onCheckedChange={setApproved} />
            {approved ? "Visible to client" : "Internal only"}
          </label>

          <Button
            variant="primary"
            size="sm"
            className="ml-auto"
            disabled={posting || body.trim() === ""}
            onClick={post}
          >
            {posting ? <Loader2 className="animate-spin" /> : <Send />}
            Post
          </Button>
        </div>
      </div>

      {/* Feed ------------------------------------------------------------ */}
      {notes.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
          <EmptyState
            compact
            icon={MessageSquarePlus}
            title="No progress notes yet"
            description="Write the first one above. Approve it and it appears in the client portal."
          />
        </div>
      ) : (
        <ol className="mt-5 space-y-3">
          {rows.map(({ note, showDay }) => {
            const day = note.created_at.slice(0, 10);
            const isApproved = note.approved_at !== null;
            return (
              <React.Fragment key={note.id}>
                {showDay && (
                  <li
                    className="flex items-center gap-3 pt-2 first:pt-0"
                    aria-hidden="true"
                  >
                    <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                      {formatDate(day)}
                    </span>
                    <span className="h-px flex-1 bg-[var(--border-subtle)]" />
                  </li>
                )}
                <li
                  className={cn(
                    "rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4",
                    !isApproved && "border-l-2 border-l-[var(--border-strong)]",
                  )}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-2xs text-[var(--text-tertiary)]">
                    <span>{formatRelative(note.created_at)}</span>
                    {note.work_item_title && (
                      <>
                        <span aria-hidden="true">·</span>
                        <Link
                          href={`/app/projects/${projectSlug}/items?item=${note.work_item_id}`}
                          className="max-w-[14rem] truncate hover:text-[var(--accent-text)]"
                        >
                          {note.work_item_title}
                        </Link>
                      </>
                    )}
                    <span className="ml-auto flex items-center gap-2">
                      {isApproved ? (
                        <Tooltip content="Published in the client portal">
                          <span className="flex items-center gap-1 text-[var(--accent-text)]">
                            <Eye className="size-3" />
                            Client
                          </span>
                        </Tooltip>
                      ) : (
                        <Badge tone="neutral">Internal only</Badge>
                      )}
                    </span>
                  </div>

                  <Markdown content={note.body} className="text-sm" />

                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId === note.id}
                      onClick={() => setNoteApproved(note.id, !isApproved)}
                    >
                      {busyId === note.id ? (
                        <Loader2 className="animate-spin" />
                      ) : isApproved ? (
                        <EyeOff />
                      ) : (
                        <Check />
                      )}
                      {isApproved ? "Unapprove" : "Approve for the client"}
                    </Button>
                    <IconButton
                      label="Delete this note"
                      variant="danger-ghost"
                      size="sm"
                      disabled={busyId === note.id}
                      onClick={() => remove(note.id)}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </li>
              </React.Fragment>
            );
          })}
        </ol>
      )}
    </section>
  );
}
