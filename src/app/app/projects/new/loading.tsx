import { PageHeader } from "@/components/ui/card";
import { FormSkeleton } from "@/components/ui/skeleton";

/** Four labelled sections of fields, in the shape the real form arrives in. */
export default function NewProjectLoading() {
  return (
    <>
      <PageHeader title="New project" />
      <FormSkeleton sections={[4, 3, 2, 2]} className="max-w-[46rem] space-y-9" />
    </>
  );
}
