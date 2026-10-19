import { PageHeader } from "@/components/ui/card";
import { FieldSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Mirrors the entry form: label + control, five times, then the submit row. */
export default function LoadingNewTimeEntry() {
  return (
    <>
      <PageHeader title="Log time" />
      <div
        className="mx-auto max-w-[34rem] space-y-4 px-4 py-5 md:px-6 md:py-6"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">Loading</span>
        {[
          "h-11 w-full md:h-9",
          "h-11 w-full md:h-9",
          "h-11 w-40 md:h-9",
          "h-24 w-full",
          "h-11 w-full md:h-9",
        ].map((shape, index) => (
          <FieldSkeleton key={index} control={shape} />
        ))}
        <Skeleton className="h-11 w-full rounded-[var(--radius-lg)] md:h-9" />
        <Skeleton className="h-11 w-full md:h-9" />
      </div>
    </>
  );
}
