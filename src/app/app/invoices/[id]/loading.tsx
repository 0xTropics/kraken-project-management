import { Card, PageHeader } from "@/components/ui/card";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function LoadingInvoice() {
  return (
    <>
      <PageHeader title="Invoice" />
      <div className="mx-auto max-w-[60rem] space-y-5 px-4 py-6 md:px-6">
        <Skeleton className="h-10 rounded-[var(--radius-lg)]" />
        <Card className="px-5 py-6 sm:px-8 sm:py-9">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="space-y-2 text-right">
              <Skeleton className="ml-auto h-3 w-16" />
              <Skeleton className="ml-auto h-7 w-28" />
            </div>
          </div>
          <div className="my-6 h-px bg-[var(--border-subtle)]" />
          <div className="grid gap-6 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
          <div className="mt-8 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-3.5 w-12" />
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            ))}
          </div>
          <div className="mt-8 flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <Skeleton className="h-3.5" />
              <Skeleton className="h-6" />
            </div>
          </div>
        </Card>
        <Card>
          <ListSkeleton rows={4} />
        </Card>
      </div>
    </>
  );
}
