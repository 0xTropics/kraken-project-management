"use client";

import * as React from "react";
import { Ellipsis, Loader2, Plus } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { WORK_ITEM_TYPE_META } from "@/components/ui/badge";
import { WORK_ITEM_TYPES, type WorkItemStatus, type WorkItemType } from "@/lib/db/types";
import { cn } from "@/lib/cn";

/**
 * Title plus type, nothing else. Everything else defaults, because a
 * capture box that asks six questions stops being used.
 */
export function QuickAdd({
  status,
  onCreate,
  onExpand,
  compact,
  placeholder = "Add an item…",
}: {
  status?: WorkItemStatus;
  onCreate: (input: { title: string; type: WorkItemType; status?: WorkItemStatus }) => Promise<unknown>;
  /**
   * Hands what has been typed so far to the full create form. Present so that
   * realising mid-capture that you need the other five fields costs nothing --
   * without it the title would have to be retyped.
   */
  onExpand?: (draft: { title: string; type: WorkItemType; status?: WorkItemStatus }) => void;
  compact?: boolean;
  placeholder?: string;
}) {
  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<WorkItemType>("feature");
  const [pending, setPending] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || pending) return;
    setPending(true);
    const created = await onCreate({ title: trimmed, type, status });
    setPending(false);
    if (created) {
      setTitle("");
      inputRef.current?.focus();
    }
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        "flex items-center gap-1.5 rounded-[var(--radius-md)] border border-transparent",
        "transition-colors duration-100",
        "focus-within:border-[var(--border-default)] focus-within:bg-[var(--bg-panel)]",
        compact ? "px-1.5 py-1" : "px-2 py-1.5",
      )}
    >
      <div className="flex shrink-0 items-center gap-0.5">
        {WORK_ITEM_TYPES.map((value) => {
          const meta = WORK_ITEM_TYPE_META[value];
          const active = type === value;
          return (
            <button
              key={value}
              type="button"
              aria-label={meta.label}
              aria-pressed={active}
              title={meta.label}
              onClick={() => setType(value)}
              className={cn(
                "grid size-5 place-items-center rounded-[var(--radius-xs)] transition-colors",
                active
                  ? cn("bg-[var(--bg-active)]", meta.className)
                  : "text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]",
              )}
            >
              <meta.Icon className="size-3.5" />
            </button>
          );
        })}
      </div>
      <input
        ref={inputRef}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={placeholder}
        aria-label="New work item title"
        className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--text-tertiary)]"
      />
      {onExpand && (
        <IconButton
          type="button"
          label="More options"
          variant="ghost"
          size="xs"
          className="shrink-0"
          onClick={() => onExpand({ title: title.trim(), type, status })}
        >
          <Ellipsis />
        </IconButton>
      )}
      {title.trim() && (
        <Button type="submit" variant="primary" size="xs" disabled={pending} className="shrink-0">
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          Add
        </Button>
      )}
    </form>
  );
}
