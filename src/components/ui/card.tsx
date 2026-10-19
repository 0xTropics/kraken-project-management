import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-panel)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * The sticky top bar every internal page shares: breadcrumb-scale title on the
 * left, actions on the right, an optional row of tabs beneath. Height is fixed
 * at 48px so switching pages never shifts the content underneath.
 */
export function PageHeader({
  title,
  eyebrow,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]/85 backdrop-blur-md",
        className,
      )}
    >
      <div className="flex h-12 items-center gap-3 px-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {eyebrow && (
            <span className="hidden shrink-0 items-center gap-2 text-sm text-[var(--text-tertiary)] sm:flex">
              {eyebrow}
              <span aria-hidden="true">/</span>
            </span>
          )}
          <h1 className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function SectionTitle({
  children,
  count,
  action,
  className,
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
        {children}
        {count !== undefined && (
          <span className="rounded-full bg-[var(--bg-inset)] px-1.5 py-px text-2xs tabular-nums font-medium tracking-normal text-[var(--text-secondary)]">
            {count}
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}

/** The "All →" link that sits in a SectionTitle's `action` slot. */
export function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1 text-xs text-[var(--accent-text)] hover:underline"
    >
      {children}
      <ArrowRight className="size-3" />
    </Link>
  );
}
