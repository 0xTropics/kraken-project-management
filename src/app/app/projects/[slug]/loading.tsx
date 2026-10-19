import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the overview: a four-cell number band, then a 1.55/1 split. */
export default function ProjectLoading() {
  return (
    <div className="mx-auto max-w-[80rem] space-y-8 px-4 py-6 md:px-6" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="grid gap-px grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--border-subtle)] sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[var(--bg-panel)] p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-3 h-1.5 rounded-full" />
            <Skeleton className="mt-3 h-3 w-36" />
          </div>
        ))}
      </div>

      <div className="grid gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2 px-4 py-3">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-1.5 rounded-full" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <Skeleton className="size-3.5 shrink-0 rounded-full" />
                  <Skeleton className="h-3.5" style={{ maxWidth: `${40 + ((i * 11) % 35)}%` }} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="min-w-0 space-y-8">
          {Array.from({ length: 2 }).map((_, section) => (
            <div key={section} className="space-y-3">
              <Skeleton className="h-3 w-24" />
              <div className="space-y-2.5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
                <Skeleton className="h-2 rounded-full" />
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-3.5" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
