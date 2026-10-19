import * as React from "react";
import { Bug, CircleDashed, CircleDot, CircleCheck, CircleSlash, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";
import type {
  InvoiceStatus,
  ProjectStatus,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
} from "@/lib/db/types";

/**
 * A badge sets its label in the `-text` variant, not the fill colour: the fill
 * hue at 12% alpha is not a readable background for the same hue at full
 * strength in light mode. Dark mode maps `-text` back onto the fill, where it
 * already clears AA.
 */
const TONES = {
  neutral: "bg-[var(--bg-inset)] text-[var(--text-secondary)]",
  accent: "bg-[var(--accent-subtle)] text-[var(--accent-text)]",
  success: "bg-[var(--success-subtle)] text-[var(--success-text)]",
  warning: "bg-[var(--warning-subtle)] text-[var(--warning-text)]",
  danger: "bg-[var(--danger-subtle)] text-[var(--danger-text)]",
  info: "bg-[var(--info-subtle)] text-[var(--info-text)]",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5",
        "text-2xs font-medium leading-4 whitespace-nowrap",
        "[&_svg]:size-3 [&_svg]:shrink-0",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

export const WORK_ITEM_STATUS_META: Record<
  WorkItemStatus,
  { label: string; tone: Tone; Icon: React.ComponentType<{ className?: string }> }
> = {
  backlog: { label: "Backlog", tone: "neutral", Icon: CircleDashed },
  planned: { label: "Planned", tone: "info", Icon: CircleDot },
  in_progress: { label: "In progress", tone: "warning", Icon: CircleDot },
  done: { label: "Done", tone: "success", Icon: CircleCheck },
  wont_do: { label: "Won't do", tone: "neutral", Icon: CircleSlash },
};

export const WORK_ITEM_TYPE_META: Record<
  WorkItemType,
  { label: string; Icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  feature: { label: "Feature", Icon: Sparkles, className: "text-[var(--accent-text)]" },
  bug: { label: "Bug", Icon: Bug, className: "text-[var(--danger)]" },
  chore: { label: "Chore", Icon: Wrench, className: "text-[var(--text-tertiary)]" },
};

export const PRIORITY_META: Record<
  WorkItemPriority,
  { label: string; tone: Tone; dot: string }
> = {
  low: { label: "Low", tone: "neutral", dot: "bg-[var(--priority-low)]" },
  medium: { label: "Medium", tone: "warning", dot: "bg-[var(--priority-medium)]" },
  high: { label: "High", tone: "danger", dot: "bg-[var(--priority-high)]" },
};

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Completed", tone: "info" },
  archived: { label: "Archived", tone: "neutral" },
};

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  void: { label: "Void", tone: "danger" },
};

export function StatusBadge({ status, className }: { status: WorkItemStatus; className?: string }) {
  const { label, tone, Icon } = WORK_ITEM_STATUS_META[status];
  return (
    <Badge tone={tone} className={className}>
      <Icon />
      {label}
    </Badge>
  );
}

export function TypeIcon({ type, className }: { type: WorkItemType; className?: string }) {
  const { Icon, label, className: tint } = WORK_ITEM_TYPE_META[type];
  return (
    <span title={label} aria-label={label} role="img" className={cn("inline-flex", tint, className)}>
      <Icon className="size-3.5" />
    </span>
  );
}

export function PriorityDot({
  priority,
  className,
}: {
  priority: WorkItemPriority;
  className?: string;
}) {
  const { label, dot } = PRIORITY_META[priority];
  return (
    <span
      title={`${label} priority`}
      aria-label={`${label} priority`}
      role="img"
      className={cn("inline-block size-1.5 rounded-full", dot, className)}
    />
  );
}
