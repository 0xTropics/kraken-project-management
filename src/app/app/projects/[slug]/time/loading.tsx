import { Skeleton, TimeSkeleton } from "@/components/ui/skeleton";

/** Matches the tab: toolbar, totals strip, billing note, grouped table. */
export default function LoadingProjectTime() {
  return (
    <>
      <div className="border-b border-[var(--border-subtle)] px-4 py-2 md:px-6">
        <div className="mx-auto flex max-w-[80rem] items-center gap-2">
          <Skeleton className="h-7 w-32 rounded-[var(--radius-md)]" />
          <Skeleton className="h-7 w-52 rounded-[var(--radius-md)]" />
          <Skeleton className="ml-auto h-7 w-24 rounded-[var(--radius-md)]" />
        </div>
      </div>

      <TimeSkeleton rows={7}>
        <Skeleton className="h-11 w-full rounded-[var(--radius-lg)]" />
      </TimeSkeleton>
    </>
  );
}
