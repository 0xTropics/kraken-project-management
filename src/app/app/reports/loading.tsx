import { PageHeader } from "@/components/ui/card";
import { CardsSkeleton, ListSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Filter row, four stat tiles, two chart panels, then the two tables. */
export default function LoadingReports() {
  return (
    <>
      <PageHeader title="Reports" />

      <div className="mx-auto max-w-[80rem] px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-7 w-24 rounded-[var(--radius-md)]" />
          <Skeleton className="h-7 w-24 rounded-[var(--radius-md)]" />
          <Skeleton className="h-7 w-28 rounded-[var(--radius-md)]" />
          <Skeleton className="h-7 w-20 rounded-[var(--radius-md)]" />
          <Skeleton className="h-7 w-64 rounded-[var(--radius-md)]" />
        </div>
      </div>

      <div className="mx-auto max-w-[80rem] space-y-8 px-4 pb-10 md:px-6" aria-busy="true">
        <span className="sr-only">Loading</span>
        <CardsSkeleton cards={4} />

        <div className="space-y-3">
          <Skeleton className="h-3 w-56" />
          <div className="grid gap-3 grid-cols-[minmax(0,1fr)] lg:grid-cols-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4"
              >
                <Skeleton className="h-3 w-28" />
                <Skeleton className="mt-3 h-[190px] w-full rounded-[var(--radius-md)]" />
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
            <div className="h-9 border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)]" />
            <ListSkeleton rows={4} />
          </div>
        </div>

        <div className="space-y-3">
          <Skeleton className="h-3 w-48" />
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
            <div className="h-9 border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)]" />
            <ListSkeleton rows={4} />
          </div>
        </div>
      </div>
    </>
  );
}
