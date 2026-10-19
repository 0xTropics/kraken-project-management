import { PageHeader } from "@/components/ui/card";
import { FieldSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function ClientLoading() {
  return (
    <>
      <PageHeader title="Client" />
      <div className="mx-auto max-w-[76rem] space-y-8 px-4 py-6 md:px-6" aria-busy="true">
        <span className="sr-only">Loading</span>
        <div className="grid gap-px grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--border-subtle)] sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-[var(--bg-panel)] p-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-3 h-7 w-32" />
              <Skeleton className="mt-3 h-3 w-40" />
            </div>
          ))}
        </div>
        <div className="grid gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-10">
          <div className="space-y-3">
            <Skeleton className="h-3 w-20" />
            <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5 px-4 py-3">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <Skeleton className="h-3 w-16" />
            {Array.from({ length: 3 }).map((_, i) => (
              <FieldSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
