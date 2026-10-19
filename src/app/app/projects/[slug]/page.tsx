import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CircleDot,
  ExternalLink,
  History,
  Receipt,
  Settings,
} from "lucide-react";
import { SectionLink, SectionTitle } from "@/components/ui/card";
import { Badge, StatusBadge, TypeIcon, WORK_ITEM_STATUS_META } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { HoursBar, Stat } from "@/components/dashboard/stat";
import { DescriptionCard } from "@/components/projects/description-card";
import { MilestonesCard } from "@/components/projects/milestones-card";
import { markdownExcerpt } from "@/components/notes/markdown";
import {
  currentPeriod,
  getItemStatusCounts,
  getProjectBySlug,
  getProjectStats,
  getRecentActivity,
  listMilestones,
} from "@/lib/data/projects";
import { WORK_ITEM_STATUSES } from "@/lib/db/types";
import { billingModelLabel, flatFeeName, monthlyFlatFee } from "@/lib/billing-model";
import { formatDate, formatHours, formatMoney, formatRelative, monthLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Overview" };

/** Status colours come from the same tokens the badges use, never a literal. */
const STATUS_BAR: Record<string, string> = {
  backlog: "bg-[var(--border-strong)]",
  planned: "bg-[var(--info)]",
  in_progress: "bg-[var(--warning)]",
  done: "bg-[var(--success)]",
  wont_do: "bg-[var(--text-tertiary)]",
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireInternalPage();
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const [stats, milestones, statusCounts, activity] = await Promise.all([
    getProjectStats(project.id),
    listMilestones(project.id),
    getItemStatusCounts(project.id),
    getRecentActivity(project.id, 8),
  ]);

  const base = `/app/projects/${project.slug}`;
  const period = currentPeriod();
  const periodGap = round(stats.hours_worked_period - stats.hours_billed_period);
  const totalGap = round(stats.hours_worked_total - stats.hours_billed_total);
  const counts = new Map(statusCounts.map((row) => [row.status, row.count]));
  const itemsTotal = statusCounts.reduce((sum, row) => sum + row.count, 0);
  const isHourly = project.billing_model === "hourly";
  // Retainer and maintenance both bill a flat monthly fee; hourly bills time.
  const flatFee = monthlyFlatFee(project);

  return (
    <div className="mx-auto max-w-[80rem] space-y-8 px-4 py-6 md:px-6">
      {/* Numbers band ------------------------------------------------------
          A gap-px grid over the border colour: hairlines land correctly at
          every breakpoint without positional border classes. */}
      <section aria-label="Project summary">
        <div className="grid gap-px grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--border-subtle)] sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-[var(--bg-panel)] p-4">
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
              {monthLabel(period.start.slice(0, 7))} hours
            </p>
            <p className="mt-1.5 flex items-baseline gap-1.5 leading-none">
              <span className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                {formatHours(stats.hours_billed_period)}
              </span>
              <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
                of {formatHours(stats.hours_worked_period)} worked
              </span>
            </p>
            <div className="mt-2.5">
              <HoursBar
                worked={stats.hours_worked_period}
                billed={stats.hours_billed_period}
              />
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
              {periodGap > 0 ? (
                <span className="text-[var(--warning)]">
                  {formatHours(periodGap)} written off as goodwill
                </span>
              ) : (
                "Everything worked was billed"
              )}
            </p>
          </div>

          <div className="bg-[var(--bg-panel)] p-4">
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
              Hours all time
            </p>
            <p className="mt-1.5 flex items-baseline gap-1.5 leading-none">
              <span className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                {formatHours(stats.hours_billed_total)}
              </span>
              <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
                of {formatHours(stats.hours_worked_total)} worked
              </span>
            </p>
            <div className="mt-2.5">
              <HoursBar worked={stats.hours_worked_total} billed={stats.hours_billed_total} />
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
              {totalGap > 0 ? (
                <span className="text-[var(--warning)]">
                  {formatHours(totalGap)} of goodwill since{" "}
                  {project.started_at ? formatDate(project.started_at) : "the start"}
                </span>
              ) : (
                "No goodwill gap"
              )}
            </p>
          </div>

          <Stat
            label="Not yet invoiced"
            href={`${base}/invoices`}
            className="rounded-none border-0"
            value={
              isHourly
                ? formatMoney(stats.unbilled_amount, project.currency)
                : formatHours(stats.unbilled_hours)
            }
          >
            <p className="mt-2.5 text-xs text-[var(--text-tertiary)]">
              {isHourly
                ? `${formatHours(stats.unbilled_hours)} of billable time waiting on an invoice`
                : `Logged against the ${formatMoney(flatFee ?? 0, project.currency)} ${flatFeeName(project.billing_model)}`}
            </p>
          </Stat>

          <Stat
            label="Outstanding"
            href={`${base}/invoices`}
            className="rounded-none border-0"
            tone={stats.outstanding_total > 0 ? "warning" : "default"}
            value={formatMoney(stats.outstanding_total, project.currency)}
          >
            <p className="mt-2.5 text-xs text-[var(--text-tertiary)]">
              {stats.invoices_outstanding === 0
                ? "No draft or unpaid invoices"
                : `${stats.invoices_outstanding} invoice${stats.invoices_outstanding === 1 ? "" : "s"} in draft or awaiting payment`}
            </p>
          </Stat>
        </div>
      </section>

      <div className="grid gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          {/* Description -------------------------------------------------- */}
          <section aria-labelledby="scope-heading">
            <SectionTitle className="mb-2">
              <span id="scope-heading">Scope</span>
            </SectionTitle>
            <DescriptionCard projectId={project.id} description={project.description} />
          </section>

          {/* Milestones --------------------------------------------------- */}
          <MilestonesCard
            projectId={project.id}
            projectSlug={project.slug}
            milestones={milestones}
          />

          {/* Activity ----------------------------------------------------- */}
          <section aria-labelledby="activity-heading">
            <SectionTitle
              className="mb-3"
              action={<SectionLink href={`${base}/notes`}>All notes</SectionLink>}
            >
              <span id="activity-heading">Recent activity</span>
            </SectionTitle>
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
              {activity.length === 0 ? (
                <EmptyState
                  compact
                  icon={History}
                  title="Nothing has happened yet"
                  description="Work items moving and progress notes landing both show up here."
                />
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {activity.map((entry) => (
                    <li key={`${entry.kind}-${entry.id}`}>
                      <Link
                        href={
                          entry.kind === "note"
                            ? `${base}/notes`
                            : `${base}/items?item=${entry.id}`
                        }
                        className="flex items-start gap-2.5 px-4 py-2.5 transition-colors duration-75 hover:bg-[var(--bg-hover)]"
                      >
                        <span className="mt-0.5 flex w-4 shrink-0 justify-center">
                          {entry.kind === "item" && entry.type ? (
                            <TypeIcon type={entry.type} />
                          ) : (
                            <CircleDot className="size-3.5 text-[var(--text-tertiary)]" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-base text-[var(--text-primary)]",
                              entry.kind === "note" ? "line-clamp-2" : "truncate",
                            )}
                          >
                            {entry.kind === "note"
                              ? markdownExcerpt(entry.title, 140)
                              : entry.title}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs text-[var(--text-tertiary)]">
                            <span>{entry.kind === "note" ? "Progress note" : "Work item"}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatRelative(entry.at)}</span>
                          </p>
                        </div>
                        <span className="shrink-0">
                          {entry.kind === "item" && entry.status ? (
                            <StatusBadge status={entry.status} />
                          ) : !entry.approved ? (
                            <Badge tone="neutral">Internal only</Badge>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-8">
          {/* Work ---------------------------------------------------------- */}
          <section aria-labelledby="work-heading">
            <SectionTitle
              className="mb-3"
              count={itemsTotal}
              action={<SectionLink href={`${base}/items`}>Board</SectionLink>}
            >
              <span id="work-heading">Work items</span>
            </SectionTitle>
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
              {itemsTotal === 0 ? (
                <p className="py-2 text-center text-sm text-[var(--text-tertiary)]">
                  No work items yet.{" "}
                  <Link
                    href={`${base}/items`}
                    className="text-[var(--accent-text)] underline underline-offset-2 decoration-[color-mix(in_srgb,var(--accent-text)_40%,transparent)] hover:decoration-[var(--accent-text)]"
                  >
                    Add the first one
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <div
                    className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
                    role="img"
                    aria-label={`${stats.items_done} of ${itemsTotal} work items done`}
                  >
                    {WORK_ITEM_STATUSES.filter((status) => (counts.get(status) ?? 0) > 0).map(
                      (status) => (
                        <span
                          key={status}
                          className={cn("h-full rounded-full", STATUS_BAR[status])}
                          style={{ width: `${((counts.get(status) ?? 0) / itemsTotal) * 100}%` }}
                        />
                      ),
                    )}
                  </div>
                  <ul className="mt-3 space-y-0.5">
                    {WORK_ITEM_STATUSES.filter((status) => (counts.get(status) ?? 0) > 0).map(
                      (status) => (
                        <li key={status}>
                          <Link
                            href={`${base}/items`}
                            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 transition-colors duration-75 hover:bg-[var(--bg-hover)]"
                          >
                            <span
                              className={cn("size-2 shrink-0 rounded-full", STATUS_BAR[status])}
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)]">
                              {WORK_ITEM_STATUS_META[status].label}
                            </span>
                            <span className="shrink-0 text-sm tabular-nums text-[var(--text-primary)]">
                              {counts.get(status)}
                            </span>
                          </Link>
                        </li>
                      ),
                    )}
                  </ul>
                </>
              )}
            </div>
          </section>

          {/* Billing ------------------------------------------------------- */}
          <section aria-labelledby="billing-heading">
            <SectionTitle
              className="mb-3"
              action={
                <Link
                  href={`${base}/settings`}
                  className="flex items-center gap-1 text-xs text-[var(--accent-text)] hover:underline"
                >
                  <Settings className="size-3" />
                  Edit
                </Link>
              }
            >
              <span id="billing-heading">Billing</span>
            </SectionTitle>
            <dl className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] text-sm">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-[var(--text-tertiary)]">Model</dt>
                <dd className="text-[var(--text-primary)]">
                  {billingModelLabel(project.billing_model)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-[var(--text-tertiary)]">{isHourly ? "Rate" : "Monthly fee"}</dt>
                <dd className="tabular-nums text-[var(--text-primary)]">
                  {isHourly
                    ? project.hourly_rate
                      ? `${formatMoney(project.hourly_rate, project.currency)} / hour`
                      : "—"
                    : flatFee
                      ? `${formatMoney(flatFee, project.currency)} / month`
                      : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-[var(--text-tertiary)]">Tax</dt>
                <dd className="tabular-nums text-[var(--text-primary)]">
                  {project.tax_rate > 0
                    ? `${round(project.tax_rate * 100)}%`
                    : "None"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-[var(--text-tertiary)]">Client</dt>
                <dd className="min-w-0 truncate">
                  <Link
                    href={`/app/clients/${project.client_id}`}
                    className="text-[var(--accent-text)] hover:underline"
                  >
                    {project.client_name}
                  </Link>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-[var(--text-tertiary)]">Started</dt>
                <dd className="tabular-nums text-[var(--text-primary)]">
                  {formatDate(project.started_at)}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href={`${base}/invoices`}>
                  <Receipt />
                  Invoices
                </Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href={`${base}/portal`}>
                  <ExternalLink />
                  Portal preview
                </Link>
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
