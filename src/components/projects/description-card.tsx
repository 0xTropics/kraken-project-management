"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Markdown } from "@/components/notes/markdown";
import { api, run } from "@/lib/client-api";
import { cn } from "@/lib/cn";

/**
 * The project's scope summary, edited inline where it is read rather than in
 * a modal. This text is the first thing the client sees in their portal, so
 * the editor says so.
 */
export function DescriptionCard({
  projectId,
  description,
}: {
  projectId: string;
  description: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(description ?? "");
  const [saving, startSaving] = React.useTransition();

  function save() {
    if (draft === (description ?? "")) {
      setEditing(false);
      return;
    }
    startSaving(async () => {
      const result = await run(
        api(`/api/internal/projects/${projectId}`, {
          method: "PATCH",
          body: { description: draft },
        }),
        { success: "Description updated.", error: "Could not save the description" },
      );
      if (result !== null) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  if (editing) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-panel)] p-3">
        <Textarea
          value={draft}
          autoFocus
          rows={5}
          maxLength={4000}
          placeholder="What this project covers. Markdown works."
          className="border-transparent bg-transparent hover:border-transparent focus:border-transparent focus:ring-0"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDraft(description ?? "");
              setEditing(false);
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) save();
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-2xs text-[var(--text-tertiary)]">
            Visible to the client. <kbd className="font-mono">⌘↵</kbd> to save.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(description ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={saving} onClick={save}>
              {saving && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(description ?? "");
        setEditing(true);
      }}
      title="Click to edit"
      className={cn(
        "group block w-full rounded-[var(--radius-lg)] border border-transparent p-3 text-left",
        "transition-colors duration-100 hover:border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]",
      )}
    >
      {description ? (
        <Markdown content={description} className="text-sm [&_p]:leading-relaxed" />
      ) : (
        <span className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
          <Pencil className="size-3.5" />
          Describe the scope — the client reads this at the top of their portal.
        </span>
      )}
      {description && (
        <span className="mt-2 flex items-center gap-1 text-2xs text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100">
          <Pencil className="size-3" />
          Click to edit
        </span>
      )}
    </button>
  );
}
