import { CardsSkeleton, ListSkeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="mx-auto max-w-[80rem] px-4 py-6 md:px-6" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="skeleton mb-4 h-3 w-24" />
      <CardsSkeleton />
      <div className="mt-8 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
        <ListSkeleton rows={6} />
      </div>
    </div>
  );
}
