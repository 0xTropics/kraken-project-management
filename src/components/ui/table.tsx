import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Plane-density table: 36px rows, 11px uppercase headers, hairline separators,
 * no vertical rules. Numeric cells opt in to tabular figures via `numeric`.
 */
export function Table({
  label,
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & { label?: string }) {
  return (
    // A horizontally scrolling region needs to be focusable, or a keyboard user
    // cannot reach the columns that are off-screen.
    <div
      className="scroll-thin w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      tabIndex={0}
      role="region"
      aria-label={label ?? "Table"}
    >
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("border-b border-[var(--border-subtle)] text-[var(--text-tertiary)]", className)}
      {...props}
    />
  );
}

export function TH({
  className,
  numeric,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "h-8 whitespace-nowrap px-3 text-2xs font-semibold uppercase tracking-[0.05em]",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-[var(--border-subtle)]", className)} {...props} />;
}

export function TR({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        interactive && "cursor-pointer transition-colors duration-75 hover:bg-[var(--bg-hover)]",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  numeric,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "h-9 px-3 align-middle text-[var(--text-secondary)]",
        numeric && "text-right tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
