import type { Metadata } from "next";
import Link from "next/link";
import { Clock, FileText } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat } from "@/components/dashboard/stat";
import { monthsBetween } from "@/components/time/period";
import { RangePicker } from "@/components/reports/range-picker";
import { RevenueChart } from "@/components/reports/revenue-chart";
import { RevenueTable } from "@/components/reports/revenue-table";
import { UtilizationTable } from "@/components/reports/utilization-table";
import { resolveRange } from "@/components/reports/range";
import { getRevenueReport, getUtilizationReport, summariseRevenue } from "@/lib/data/reports";
import { formatHours, formatMoney } from "@/lib/format";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Reports" };

/**
 * Two questions, one date range: what came in, and what it cost in
 * hours. Currencies are kept apart everywhere -- separate stat tiles, separate
 * chart panels, separate tables, and no grand total anywhere on the page.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireInternalPage("/app/reports");
  const range = resolveRange(await searchParams);
  const [revenue, utilization] = await Promise.all([
    getRevenueReport(range),
    getUtilizationReport(range),
  ]);

  const months = monthsBetween(range.from, range.to);
  const byCurrency = summariseRevenue(revenue);
  const hoursWorked = utilization.reduce((sum, row) => sum + row.hours_worked, 0);
  const hoursBilled = utilization.reduce((sum, row) => sum + row.hours_billed, 0);
  const goodwill = Math.round((hoursWorked - hoursBilled) * 100) / 100;

  return (
    <>
      <PageHeader title="Reports" />

      <div className="mx-auto max-w-[80rem] px-4 py-4 md:px-6">
        <RangePicker range={range} />
      </div>

      <div className="mx-auto max-w-[80rem] space-y-8 px-4 pb-10 md:px-6">
        {/* Headline numbers ------------------------------------------------ */}
        <section aria-labelledby="totals-heading">
          <SectionTitle className="mb-3">
            <span id="totals-heading">{range.label}</span>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {byCurrency.map((total) => (
              <Stat
                key={total.currency}
                label={`${total.currency} revenue`}
                value={formatMoney(total.total, total.currency)}
                sub={
                  total.outstanding > 0
                    ? `${formatMoney(total.outstanding, total.currency)} outstanding`
                    : "All settled"
                }
                tone={total.outstanding > 0 ? "warning" : "success"}
              />
            ))}
            <Stat
              label="Hours worked"
              value={formatHours(hoursWorked)}
              sub={`${utilization.length} project${utilization.length === 1 ? "" : "s"}`}
              href="/app/time"
            />
            <Stat
              label="Hours billed"
              value={formatHours(hoursBilled)}
              sub={
                goodwill > 0
                  ? `${formatHours(goodwill)} written off as goodwill`
                  : "Nothing written off"
              }
              tone={goodwill > 0 ? "warning" : "default"}
            />
          </div>
        </section>

        {/* Revenue --------------------------------------------------------- */}
        <section aria-labelledby="revenue-heading" className="space-y-3">
          <SectionTitle count={revenue.length}>
            <span id="revenue-heading">Revenue per client per month</span>
          </SectionTitle>

          {revenue.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
              <EmptyState
                icon={FileText}
                title="No finalized invoices in this range"
                description="Revenue counts sent and paid invoices only — drafts have not been issued, and void invoices were withdrawn. Widen the range, or finalize a draft."
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/app/invoices">Open invoices</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <RevenueChart rows={revenue} months={months} rangeLabel={range.label} />
              <RevenueTable rows={revenue} />
            </>
          )}
        </section>

        {/* Utilization ----------------------------------------------------- */}
        <section aria-labelledby="utilization-heading" className="space-y-3">
          <SectionTitle
            count={utilization.length}
            action={
              <span className="text-2xs text-[var(--text-tertiary)]">
                Effective rate = billed amount ÷ hours worked
              </span>
            }
          >
            <span id="utilization-heading">Utilization per project</span>
          </SectionTitle>

          {utilization.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
              <EmptyState
                icon={Clock}
                title="No hours or invoices in this range"
                description="A project appears here once it has time logged against it or a finalized invoice inside the range."
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/app/time/new">Log time</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <UtilizationTable rows={utilization} />
          )}
        </section>
      </div>
    </>
  );
}
