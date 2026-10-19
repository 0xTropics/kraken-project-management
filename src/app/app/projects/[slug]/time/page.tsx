import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PeriodNav } from "@/components/time/period-nav";
import { isDateString, isPeriodView, resolvePeriod } from "@/components/time/period";
import { LogTimeModal } from "@/components/time/log-time-modal";
import { TimeView, TotalsStrip } from "@/components/time/time-view";
import { sumEntries } from "@/components/time/totals";
import { getProjectBySlug } from "@/lib/data/projects";
import { getTimeContext, getTimeFormOptions, listTimeEntries, type TimeProject } from "@/lib/data/time";
import { flatFeeName, monthlyFlatFee } from "@/lib/billing-model";
import { formatHours, formatMoney, today } from "@/lib/format";
import { cn } from "@/lib/cn";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Time" };

/**
 * The project's own week/month view. Same table as `/app/time` with the project
 * column dropped, plus the one number the global view cannot show: what the
 * worked-vs-billed gap is actually worth in this project's currency.
 */
export default async function ProjectTimePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ view?: string; anchor?: string }>;
}) {
  await requireInternalPage();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const period = resolvePeriod(
    isPeriodView(query.view) ? query.view : "week",
    isDateString(query.anchor) ? query.anchor : today(),
  );

  const [entries, context, formOptions] = await Promise.all([
    listTimeEntries({ from: period.start, to: period.end, projectIds: [project.id] }),
    getTimeContext(project.id),
    getTimeFormOptions(),
  ]);

  const totals = sumEntries(entries);
  const timeProject: TimeProject = {
    id: project.id,
    name: project.name,
    slug: project.slug,
    client_name: project.client_name,
    billing_model: project.billing_model,
    currency: project.currency,
    hourly_rate: project.hourly_rate,
  };
  const workItems = formOptions.workItems.filter((item) => item.project_id === project.id);

  // The gap in money. For an hourly project that is revenue given away; for a
  // retainer the honest number is the rate the period actually earned.
  const writtenOff =
    project.billing_model === "hourly" && project.hourly_rate
      ? Math.round(totals.gap * project.hourly_rate * 100) / 100
      : null;
  // A flat fee (retainer or maintenance) divided by the hours it really took.
  const flatFee = monthlyFlatFee(project);
  const effectiveRate =
    flatFee && totals.worked > 0 ? Math.round((flatFee / totals.worked) * 100) / 100 : null;

  const logTime = (
    <LogTimeModal project={timeProject} workItems={workItems} />
  );

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]/90 px-4 py-2 backdrop-blur-md md:px-6">
        <div className="mx-auto flex max-w-[80rem] flex-wrap items-center gap-2">
          <PeriodNav period={period} />
          <div className="ml-auto">{logTime}</div>
        </div>
      </div>

      <div className="mx-auto max-w-[80rem] space-y-4 px-4 py-5 md:px-6">
        <TotalsStrip totals={totals} label={period.label} />

        {(writtenOff !== null || effectiveRate !== null) && (
          <div
            className={cn(
              "flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[var(--radius-lg)] px-4 py-3 text-sm",
              writtenOff !== null && totals.gap > 0
                ? "bg-[var(--warning-subtle)] text-[var(--warning)]"
                : "bg-[var(--bg-inset)] text-[var(--text-secondary)]",
            )}
          >
            {writtenOff !== null && project.hourly_rate ? (
              totals.gap > 0 ? (
                <>
                  <strong className="font-semibold tabular-nums">
                    {formatMoney(writtenOff, project.currency)}
                  </strong>
                  <span>
                    written off in {period.label} — {formatHours(totals.gap)} at{" "}
                    {formatMoney(project.hourly_rate, project.currency)}/h.
                  </span>
                </>
              ) : (
                <span>
                  Every hour worked in {period.label} is billable at{" "}
                  {formatMoney(project.hourly_rate, project.currency)}/h.
                </span>
              )
            ) : null}

            {effectiveRate !== null && flatFee ? (
              <>
                <strong className="font-semibold tabular-nums">
                  {formatMoney(effectiveRate, project.currency)}/h
                </strong>
                <span>
                  effective — {formatHours(totals.worked)} worked against a{" "}
                  {formatMoney(flatFee, project.currency)} {flatFeeName(project.billing_model)}.
                </span>
              </>
            ) : null}
          </div>
        )}

        <TimeView
          entries={entries}
          period={period}
          context={context}
          showProject={false}
          emptyAction={logTime}
        />
      </div>
    </>
  );
}
