import { Skeleton } from "@/components/ui/skeleton";

export default function NotesLoading() {
  return (
    <div className="mx-auto max-w-[80rem] px-4 py-6 md:px-6" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="grid gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-10">
        <div className="min-w-0 space-y-3">
          <Skeleton className="h-3 w-28" />
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3">
            <Skeleton className="h-16 rounded-[var(--radius-md)]" />
            <div className="mt-2 flex items-center gap-2">
              <Skeleton className="h-7 w-40 rounded-[var(--radius-md)]" />
              <Skeleton className="ml-auto h-7 w-16 rounded-[var(--radius-sm)]" />
            </div>
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4"
            >
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-7 w-44 rounded-[var(--radius-sm)]" />
            </div>
          ))}
        </div>
        <div className="min-w-0 space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-full" />
          <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5 px-3 py-2.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
