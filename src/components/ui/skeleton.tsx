import type * as React from "react";
import { cn } from "@/lib/cn";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden="true" {...props} />;
}

/** Loading placeholder that keeps the shape of the list it becomes. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-[var(--border-subtle)]" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="size-3.5 rounded-full" />
          <Skeleton className="h-3.5" style={{ maxWidth: `${38 + ((i * 13) % 40)}%` }} />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A label over a control: the unit every form skeleton is built from. */
export function FieldSkeleton({ control = "h-9 rounded-[var(--radius-md)]" }: { control?: string }) {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className={control} />
    </div>
  );
}

/**
 * A form page without its data: one titled section per entry in `sections`,
 * each holding that many fields. `className` sets the width and section gap;
 * `children` follow the sections.
 */
export function FormSkeleton({
  sections = [],
  className,
  children,
}: {
  sections?: number[];
  className: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto px-4 py-6 md:px-6", className)} aria-busy="true">
      <span className="sr-only">Loading</span>
      {sections.map((fields, section) => (
        <section key={section} className="space-y-4">
          <Skeleton className="h-3 w-20" />
          {Array.from({ length: fields }).map((_, field) => (
            <FieldSkeleton key={field} />
          ))}
        </section>
      ))}
      {children}
    </div>
  );
}

/** The time views without data: totals strip over the grouped table. `children` sit between. */
export function TimeSkeleton({ rows, children }: { rows: number; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[80rem] space-y-4 px-4 py-5 md:px-6" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] px-4 py-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
        <div className="min-w-40 flex-1 space-y-2">
          <Skeleton className="h-1.5 w-full rounded-full" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>

      {children}

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
        <div className="h-8 border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)]" />
        <ListSkeleton rows={rows} />
      </div>
    </div>
  );
}

export function CardsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-20" />
        </div>
      ))}
    </div>
  );
}
