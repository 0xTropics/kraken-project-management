import { SectionTitle } from "@/components/ui/card";
import { CardsSkeleton, ListSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function LoadingProjectInvoices() {
  return (
    <div className="mx-auto max-w-[76rem] space-y-5 px-4 py-6 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>
          <Skeleton className="h-3 w-16" />
        </SectionTitle>
        <Skeleton className="h-7 w-28 rounded-[var(--radius-sm)]" />
      </div>
      <CardsSkeleton cards={1} />
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
        <ListSkeleton rows={5} />
      </div>
    </div>
  );
}
