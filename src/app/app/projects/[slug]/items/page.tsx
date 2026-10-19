import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getProjectBySlug } from "@/lib/data/projects";
import { getWorkItemsPageData } from "@/lib/data/work-items";
import { WorkItemsClient } from "@/components/work-items/work-items-client";
import { ListSkeleton } from "@/components/ui/skeleton";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Work items" };

export default async function ItemsPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireInternalPage();
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const { items, milestones, notes, requests } = await getWorkItemsPageData(project.id);

  return (
    <Suspense fallback={<ListSkeleton rows={8} />}>
      <WorkItemsClient
        projectId={project.id}
        initialItems={items}
        milestones={milestones}
        notes={notes}
        requests={requests}
      />
    </Suspense>
  );
}
