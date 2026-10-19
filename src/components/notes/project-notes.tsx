"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineInput, Textarea } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
import { Markdown, markdownExcerpt } from "@/components/notes/markdown";
import { api, run } from "@/lib/client-api";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { ProjectNote } from "@/lib/db/types";

interface Draft {
  title: string;
  body: string;
}

/** Grows with its content so a document never scrolls inside a box. */
function GrowingTextarea({
  value,
  onChange,
  ...props
}: React.ComponentProps<typeof Textarea> & { value: string }) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.max(node.scrollHeight, 96)}px`;
  }, [value]);
  return <Textarea ref={ref} value={value} onChange={onChange} {...props} />;
}

/**
 * Long-lived project documents. Editing happens in place — click a
 * document and it becomes editable where it sits, saving as you pause, with no
 * modal between you and the body.
 */
export function ProjectNotes({
  projectId,
  notes,
}: {
  projectId: string;
  notes: ProjectNote[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [state, setState] = React.useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [creating, startCreating] = React.useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState<ProjectNote | null>(null);
  const [deleting, startDeleting] = React.useTransition();
  const titleRef = React.useRef<HTMLInputElement>(null);
  // Bumped by every keystroke. A save that finishes after the draft moved on
  // must not report "saved" and stop the autosave loop, or the characters typed
  // while the request was in flight are silently lost.
  const revision = React.useRef(0);

  const save = React.useCallback(
    async (id: string, patch: Draft) => {
      const startedAt = revision.current;
      setState("saving");
      const result = await run(
        api(`/api/internal/notes/project/${id}`, { method: "PATCH", body: patch }),
        { error: "Could not save that document" },
      );
      if (result === null) {
        setState("dirty");
        return;
      }
      setState(revision.current === startedAt ? "saved" : "dirty");
      router.refresh();
    },
    [router],
  );

  // Autosave: a pause in typing is the save signal, as in Notion.
  React.useEffect(() => {
    if (state !== "dirty" || openId === null || draft === null) return;
    const timer = setTimeout(() => void save(openId, draft), 900);
    return () => clearTimeout(timer);
  }, [state, openId, draft, save]);

  /**
   * Whether a draft still differs from the row the server last sent us. This is
   * a more honest dirty check than the status flag, because the flag also
   * tracks an in-flight request.
   */
  function unsaved(note: ProjectNote, value: Draft): boolean {
    return (
      value.title !== note.title ||
      value.body !== note.body
    );
  }

  /** Write anything outstanding before the editor closes or moves elsewhere. */
  function flush() {
    if (!openId || !draft) return;
    const note = notes.find((candidate) => candidate.id === openId);
    if (note && unsaved(note, draft)) void save(openId, draft);
  }

  function open(note: ProjectNote) {
    flush();
    if (openId === note.id) {
      setOpenId(null);
      setDraft(null);
      setState("idle");
      return;
    }
    setOpenId(note.id);
    setDraft({ title: note.title, body: note.body });
    setState("idle");
  }

  function edit(patch: Partial<Draft>) {
    revision.current += 1;
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setState("dirty");
  }

  function create() {
    startCreating(async () => {
      const result = await run(
        api<{ note: ProjectNote }>("/api/internal/notes/project", {
          method: "POST",
          body: { project_id: projectId, title: "Untitled document", body: "" },
        }),
        { error: "Could not create that document" },
      );
      if (result) {
        setOpenId(result.note.id);
        setDraft({ title: result.note.title, body: "" });
        setState("idle");
        router.refresh();
        requestAnimationFrame(() => titleRef.current?.select());
      }
    });
  }

  function remove() {
    if (!confirmDelete) return;
    startDeleting(async () => {
      const result = await run(
        api(`/api/internal/notes/project/${confirmDelete.id}`, { method: "DELETE" }),
        { success: "Document deleted.", error: "Could not delete that document" },
      );
      if (result !== null) {
        if (openId === confirmDelete.id) {
          setOpenId(null);
          setDraft(null);
        }
        setConfirmDelete(null);
        router.refresh();
      }
    });
  }

  return (
    <section aria-labelledby="documents-heading" className="min-w-0">
      <SectionTitle
        className="mb-2"
        count={notes.length}
        action={
          <Button variant="ghost" size="sm" disabled={creating} onClick={create}>
            {creating ? <Loader2 className="animate-spin" /> : <Plus />}
            New
          </Button>
        }
      >
        <span id="documents-heading">Project notes</span>
      </SectionTitle>
      <p className="mb-3 text-xs leading-relaxed text-[var(--text-tertiary)]">
        Documents that outlive a single update: architecture decisions, where the
        credentials live, how this client likes to be spoken to. Never shown in the
        portal.
      </p>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
        {notes.length === 0 ? (
          <EmptyState
            compact
            icon={FileText}
            title="No documents yet"
            description="Write down the things you would otherwise re-derive every time you come back to this project."
            action={
              <Button variant="secondary" size="sm" disabled={creating} onClick={create}>
                <Plus />
                New document
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {notes.map((note) => {
              const isOpen = openId === note.id;
              const current = isOpen && draft ? draft : null;
              return (
                <li key={note.id} className={cn(isOpen && "bg-[var(--bg-panel)]")}>
                  {/* Header row: always the way in and out of the editor. */}
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => open(note)}
                      aria-expanded={isOpen}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <ChevronRight
                        className={cn(
                          "size-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform duration-150",
                          isOpen && "rotate-90",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-medium text-[var(--text-primary)]">
                          {current ? current.title || "Untitled document" : note.title}
                        </span>
                        {!isOpen && (
                          <span className="mt-0.5 block truncate text-2xs text-[var(--text-tertiary)]">
                            {note.body.trim()
                              ? markdownExcerpt(note.body, 80)
                              : "Empty document"}
                            {" · "}
                            {formatRelative(note.updated_at)}
                          </span>
                        )}
                      </span>
                    </button>
                    <IconButton
                      label="Delete this document"
                      variant="ghost"
                      size="xs"
                      className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--danger)]"
                      onClick={() => setConfirmDelete(note)}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>

                  {isOpen && current && (
                    <div className="border-t border-[var(--border-subtle)] px-3 pb-3 pt-3">
                      <InlineInput
                        ref={titleRef}
                        value={current.title}
                        maxLength={200}
                        aria-label="Document title"
                        placeholder="Untitled document"
                        className="text-lg font-semibold tracking-[-0.01em]"
                        onChange={(event) => edit({ title: event.target.value })}
                        onBlur={flush}
                      />
                      <GrowingTextarea
                        value={current.body}
                        maxLength={200_000}
                        aria-label="Document body"
                        placeholder="Markdown. Headings, lists, code fences, links."
                        className="mt-2 resize-none border-transparent bg-transparent font-mono text-xs leading-relaxed hover:border-[var(--border-subtle)] focus:border-[var(--accent)]"
                        onChange={(event) => edit({ body: event.target.value })}
                        onBlur={flush}
                      />

                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--border-subtle)] pt-3">
                        <span className="ml-auto text-2xs tabular-nums text-[var(--text-tertiary)]">
                          {state === "saving"
                            ? "Saving…"
                            : state === "dirty"
                              ? "Unsaved"
                              : state === "saved"
                                ? "Saved"
                                : `Edited ${formatRelative(note.updated_at)}`}
                        </span>
                      </div>

                      {current.body.trim() !== "" && (
                        <details className="mt-3 border-t border-[var(--border-subtle)] pt-3">
                          <summary className="cursor-pointer text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                            Preview
                          </summary>
                          <Markdown content={current.body} className="mt-2 text-sm" />
                        </details>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Delete this document?"
        description={confirmDelete ? `"${confirmDelete.title}" will be gone for good.` : undefined}
        confirmLabel="Delete document"
        busy={deleting}
        onConfirm={remove}
      >
        <p className="pb-2 text-sm text-[var(--text-secondary)]">
          Project notes are not versioned, so this cannot be undone.
        </p>
      </ConfirmDialog>
    </section>
  );
}
