import { PageHeader } from "@/components/ui/card";
import { FieldSkeleton, FormSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function NewClientLoading() {
  return (
    <>
      <PageHeader title="New client" />
      <FormSkeleton className="max-w-[42rem] space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mb-6 h-4 w-2/3" />
        {Array.from({ length: 4 }).map((_, i) => (
          <FieldSkeleton key={i} />
        ))}
      </FormSkeleton>
    </>
  );
}
