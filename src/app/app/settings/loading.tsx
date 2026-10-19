import { Card } from "@/components/ui/card";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function LoadingSettings() {
  return (
    <div className="mx-auto max-w-[64rem] space-y-5 px-4 py-6 md:px-6">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <div className="border-b border-[var(--border-subtle)] px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-72" />
          </div>
          <ListSkeleton rows={3} />
        </Card>
      ))}
    </div>
  );
}
