import { PageHeader, SectionTitle } from "@/components/ui/card";
import { CardsSkeleton, ListSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function LoadingInvoices() {
  return (
    <>
      <PageHeader title="Invoices" />
      <div className="mx-auto max-w-[80rem] space-y-6 px-4 py-6 md:px-6">
        <section>
          <SectionTitle className="mb-3">
            <Skeleton className="h-3 w-32" />
          </SectionTitle>
          <CardsSkeleton cards={2} />
        </section>
        <section className="space-y-3">
          <SectionTitle className="mb-1">
            <Skeleton className="h-3 w-20" />
          </SectionTitle>
          <div className="flex gap-2">
            <Skeleton className="h-7 w-36 rounded-[var(--radius-sm)]" />
            <Skeleton className="h-7 w-40 rounded-[var(--radius-sm)]" />
            <Skeleton className="h-7 w-24 rounded-[var(--radius-sm)]" />
          </div>
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
            <ListSkeleton rows={8} />
          </div>
        </section>
      </div>
    </>
  );
}
