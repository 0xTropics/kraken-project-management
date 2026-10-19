import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PeriodNav } from "@/components/time/period-nav";
import { isDateString, isPeriodView, resolvePeriod } from "@/components/time/period";
import { TimeView, TotalsStrip } from "@/components/time/time-view";
import { sumEntries } from "@/components/time/totals";
import { getTimeContext, listTimeEntries, listTimeProjects } from "@/lib/data/time";
import { today } from "@/lib/format";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Time" };

/**
 * Every project's time for one period. The period, its length, and
 * the project filter all live in the URL, so a week is a link you can send.
 */
export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; anchor?: string; project?: string }>;
}) {
  await requireInternalPage("/app/time");
  const params = await searchParams;
  const period = resolvePeriod(
    isPeriodView(params.view) ? params.view : "week",
    isDateString(params.anchor) ? params.anchor : today(),
  );

  const projects = await listTimeProjects();
  const selected = projects.find((p) => p.slug === params.project) ?? null;

  const [entries, context] = await Promise.all([
    listTimeEntries({
      from: period.start,
      to: period.end,
      projectIds: selected ? [selected.id] : undefined,
    }),
    getTimeContext(selected?.id),
  ]);

  const totals = sumEntries(entries);
  const logTime = (
    <Button asChild variant="primary" size="sm">
      <Link href={selected ? `/app/time/new?project=${selected.slug}` : "/app/time/new"}>
        <Plus />
        Log time
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader title="Time" actions={logTime}>
        <div className="border-t border-[var(--border-subtle)] px-4 py-2 md:px-6">
          <PeriodNav period={period} projects={projects} projectSlug={selected?.slug ?? null} />
        </div>
      </PageHeader>

      <div className="mx-auto max-w-[80rem] space-y-4 px-4 py-5 md:px-6">
        <TotalsStrip totals={totals} label={period.label} />
        <TimeView
          entries={entries}
          period={period}
          context={context}
          emptyAction={logTime}
        />
      </div>
    </>
  );
}
