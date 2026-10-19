import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NewProjectForm } from "@/components/projects/new-project-form";
import { listClientOptions, listProjects } from "@/lib/data/projects";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requireInternalPage("/app/projects/new");
  const [clients, projects] = await Promise.all([listClientOptions(), listProjects()]);

  return (
    <>
      <PageHeader
        title="New project"
        eyebrow={
          <Link href="/app/projects" className="hover:text-[var(--text-secondary)]">
            Projects
          </Link>
        }
      />
      <div className="mx-auto max-w-[46rem] px-4 py-6 md:px-6">
        {clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Add a client first"
            description="Every project is billed to a client, so a client has to exist before a project can."
            action={
              <Button asChild variant="primary" size="md">
                <Link href="/app/clients/new">New client</Link>
              </Button>
            }
          />
        ) : (
          <NewProjectForm clients={clients} takenSlugs={projects.map((p) => p.slug)} />
        )}
      </div>
    </>
  );
}
