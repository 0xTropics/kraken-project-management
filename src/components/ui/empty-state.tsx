import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Empty states say what the surface is for and offer the one action that fills
 * it. No illustration: at this density a picture reads as filler.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
  danger,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
  /** Tints the icon for an error rather than an empty list. */
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-6 py-10" : "px-6 py-16",
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            "mb-3 grid size-9 place-items-center rounded-[var(--radius-lg)]",
            danger ? "bg-[var(--danger-subtle)]" : "bg-[var(--bg-inset)]",
          )}
        >
          <Icon
            className={cn("size-4.5", danger ? "text-[var(--danger)]" : "text-[var(--text-tertiary)]")}
          />
        </div>
      )}
      <p className="text-base font-medium text-[var(--text-primary)]">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-[var(--text-tertiary)]">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Something went wrong, with a way back. Used by every error.tsx boundary. */
export function ErrorState({
  title = "Something went wrong",
  description,
  action,
}: {
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <EmptyState danger icon={TriangleAlert} title={title} description={description} action={action} />
  );
}
