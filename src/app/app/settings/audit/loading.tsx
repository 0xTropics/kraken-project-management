import { ListSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function LoadingAudit() {
  return (
    <div className="mx-auto max-w-[84rem] space-y-4 px-4 py-6 md:px-6">
      <div className="flex flex-wrap gap-2">
        {[8.5, 8.5, 9, 9, 8.75, 8.75].map((width, i) => (
          <Skeleton key={i} className="h-7 rounded-[var(--radius-sm)]" style={{ width: `${width}rem` }} />
        ))}
      </div>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
        <ListSkeleton rows={12} />
      </div>
    </div>
  );
}
