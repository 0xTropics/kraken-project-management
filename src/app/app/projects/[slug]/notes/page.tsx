import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProgressFeed } from "@/components/notes/progress-feed";
import { ProjectNotes } from "@/components/notes/project-notes";
import { getProjectBySlug } from "@/lib/data/projects";
import { listNoteWorkItems, listProgressNotes, listProjectNotes } from "@/lib/data/notes";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Notes" };

/**
 * The progress feed and the project's documents, side by side on a
 * wide screen and stacked on a phone. The feed leads because it is the thing
 * that changes daily; the documents are the memory.
 */
export default async function ProjectNotesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireInternalPage();
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const [progress, documents, workItems] = await Promise.all([
    listProgressNotes(project.id),
    listProjectNotes(project.id),
    listNoteWorkItems(project.id),
  ]);

  return (
    <div className="mx-auto max-w-[80rem] px-4 py-6 md:px-6">
      <div className="grid gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-10">
        <ProgressFeed
          projectId={project.id}
          projectSlug={project.slug}
          notes={progress}
          workItems={workItems}
        />
        <ProjectNotes projectId={project.id} notes={documents} />
      </div>
    </div>
  );
}
