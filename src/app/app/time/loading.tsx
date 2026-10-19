import { PageHeader } from "@/components/ui/card";
import { Skeleton, TimeSkeleton } from "@/components/ui/skeleton";

/** Same chrome, same totals strip, same grouped table — just without the data. */
export default function LoadingTime() {
  return (
    <>
      <PageHeader title="Time">
        <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] px-4 py-2 md:px-6">
          <Skeleton className="h-7 w-32 rounded-[var(--radius-md)]" />
          <Skeleton className="h-7 w-52 rounded-[var(--radius-md)]" />
          <Skeleton className="h-7 w-40 rounded-[var(--radius-md)]" />
        </div>
      </PageHeader>

      <TimeSkeleton rows={9} />
    </>
  );
}
