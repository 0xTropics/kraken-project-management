import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock, Lock } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TimeEntryForm } from "@/components/time/entry-form";
import { getTimeFormOptions, listRecentTimeEntries } from "@/lib/data/time";
import { formatDate, formatHours } from "@/lib/format";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Log time" };

/**
 * The one screen used from a phone. Everything here is sized for a
 * thumb first and a mouse second, and the page deliberately does not navigate
 * away on save -- Friday evening is five entries in a row, not one.
 */
export default async function NewTimeEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await requireInternalPage("/app/time/new");
  const { project: projectSlug } = await searchParams;
  const [{ projects, workItems }, recent] = await Promise.all([
    getTimeFormOptions(),
    listRecentTimeEntries(5),
  ]);

  const preselected = projects.find((p) => p.slug === projectSlug)?.id ?? null;

  return (
    <>
      <PageHeader
        title="Log time"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/app/time">
              <ArrowLeft />
              All time
            </Link>
          </Button>
        }
      />

      <div className="mx-auto max-w-[34rem] px-4 py-5 md:px-6 md:py-6">
        {projects.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
            <EmptyState
              icon={Clock}
              title="No projects to log against"
              description="Time is always attached to a project. Create one and this form fills in."
              action={
                <Button asChild variant="primary" size="sm">
                  <Link href="/app/projects/new">New project</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <TimeEntryForm
            projects={projects}
            workItems={workItems}
            defaultProjectId={preselected}
          />
        )}

        {recent.length > 0 && (
          <section aria-labelledby="recent-heading" className="mt-8">
            <SectionTitle className="mb-2">
              <span id="recent-heading">Recently logged</span>
            </SectionTitle>
            {/* Seeing the last few rows is what makes logging five entries in a
                row feel safe: a wrong project is obvious immediately. */}
            <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
              {recent.map((entry) => {
                const gap = Math.round((entry.hours_worked - entry.hours_billed) * 100) / 100;
                return (
                  <li key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base text-[var(--text-primary)]">
                        {entry.description ?? "No description"}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-2xs text-[var(--text-tertiary)]">
                        {entry.invoice_id && <Lock className="size-3 shrink-0" />}
                        {entry.project_name}
                        <span aria-hidden="true">·</span>
                        {formatDate(entry.date)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-medium tabular-nums text-[var(--text-primary)]">
                        {formatHours(entry.hours_worked)}
                      </p>
                      {gap > 0 && (
                        <p className="text-2xs tabular-nums text-[var(--warning)]">
                          −{formatHours(gap)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
