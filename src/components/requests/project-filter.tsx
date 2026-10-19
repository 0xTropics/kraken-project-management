"use client";

import Form from "next/form";
import { useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/ui/field";

/** The inbox's project filter. URL state, like every other filter in Kraken. */
export function ProjectFilter({
  value,
  projects,
}: {
  value: string;
  projects: { id: string; label: string }[];
}) {
  // A GET form replaces the whole query, which drops `request` (the open
  // panel) as before; the status tab rides along hidden. "" reads as unset.
  const status = useSearchParams().get("status");
  return (
    <Form action="" scroll={false}>
      {status && <input type="hidden" name="status" value={status} />}
      <NativeSelect
        name="project"
        aria-label="Filter by project"
        value={value}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-8 w-auto min-w-[12rem] max-w-full text-sm"
      >
        <option value="">All projects</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.label}
          </option>
        ))}
      </NativeSelect>
    </Form>
  );
}
