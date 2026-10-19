import type { Metadata } from "next";
import Link from "next/link";
import { Folder, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, PROJECT_STATUS_META } from "@/components/ui/badge";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { currentPeriod, listProjects } from "@/lib/data/projects";
import { billingRateLabel } from "@/lib/billing-model";
import { formatHours, formatRelative, monthLabel } from "@/lib/format";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  await requireInternalPage("/app/projects");
  const projects = await listProjects();
  const period = currentPeriod();

  return (
    <>
      <PageHeader
        title="Projects"
        actions={
          <Button asChild variant="primary" size="sm">
            <Link href="/app/projects/new">
              <Plus />
              New project
            </Link>
          </Button>
        }
      />

      <div className="mx-auto max-w-[80rem] px-4 py-6 md:px-6">
        {projects.length === 0 ? (
          <EmptyState
            icon={Folder}
            title="No projects yet"
            description="A project holds the work items, time, notes, and invoices for one piece of client work — and gives that client their portal."
            action={
              <Button asChild variant="primary" size="md">
                <Link href="/app/projects/new">
                  <Plus />
                  New project
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
            <Table>
              <THead>
                <tr>
                  <TH>Project</TH>
                  <TH className="hidden sm:table-cell">Client</TH>
                  <TH>Status</TH>
                  <TH className="hidden md:table-cell">Billing</TH>
                  <TH numeric className="hidden lg:table-cell">
                    {monthLabel(period.start.slice(0, 7))} hours
                  </TH>
                  <TH numeric>Open</TH>
                  <TH className="hidden xl:table-cell">Last activity</TH>
                </tr>
              </THead>
              <TBody>
                {projects.map((project) => {
                  const status = PROJECT_STATUS_META[project.status];
                  const gap =
                    Math.round((project.hours_worked - project.hours_billed) * 100) / 100;
                  return (
                    <TR key={project.id} interactive>
                      <TD className="max-w-[16rem]">
                        <Link
                          href={`/app/projects/${project.slug}`}
                          className="block truncate font-medium text-[var(--text-primary)] hover:text-[var(--accent-text)]"
                        >
                          {project.name}
                        </Link>
                      </TD>
                      <TD className="hidden max-w-[12rem] sm:table-cell">
                        <Link
                          href={`/app/clients/${project.client_id}`}
                          className="block truncate hover:text-[var(--accent-text)]"
                        >
                          {project.client_name}
                        </Link>
                      </TD>
                      <TD>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </TD>
                      <TD className="hidden whitespace-nowrap md:table-cell">
                        {billingRateLabel(project)}
                      </TD>
                      <TD numeric className="hidden whitespace-nowrap lg:table-cell">
                        <span className="text-[var(--text-primary)]">
                          {formatHours(project.hours_billed)}
                        </span>
                        {gap > 0 && (
                          <span className="ml-1 text-2xs text-[var(--warning)]">
                            −{formatHours(gap)}
                          </span>
                        )}
                      </TD>
                      <TD numeric>
                        <span className="text-[var(--text-primary)]">{project.open_items}</span>
                      </TD>
                      <TD className="hidden whitespace-nowrap text-[var(--text-tertiary)] xl:table-cell">
                        {formatRelative(project.last_activity)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
