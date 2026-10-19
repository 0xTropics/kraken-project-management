import { FormSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <FormSkeleton sections={[4, 4]} className="max-w-[46rem] space-y-10">
      <section className="space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 rounded-[var(--radius-md)]" />
        <Skeleton className="h-24 rounded-[var(--radius-lg)]" />
      </section>
      <section className="space-y-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-32 rounded-[var(--radius-lg)]" />
      </section>
    </FormSkeleton>
  );
}
