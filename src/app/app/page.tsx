import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, CircleDot, Clock, FileText, Inbox, Plus } from "lucide-react";
import { PageHeader, SectionLink, SectionTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, INVOICE_STATUS_META, PriorityDot, TypeIcon } from "@/components/ui/badge";
import { HoursBar } from "@/components/dashboard/stat";
import {
  getInProgressItems,
  getInvoicesNeedingAttention,
  getMonthHours,
  getOpenWorkByProject,
} from "@/lib/data/dashboard";
import { listSubmittedRequests } from "@/lib/data/client-requests";
import { billingModelLabel } from "@/lib/billing-model";
import { formatDate, formatHours, formatMoney, formatRelative } from "@/lib/format";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  await requireInternalPage("/app");
  const [hours, openWork, requests, inProgress, invoices] = await Promise.all([
    getMonthHours(),
    getOpenWorkByProject(),
    listSubmittedRequests(),
    getInProgressItems(),
    getInvoicesNeedingAttention(6),
  ]);

  const drafts = invoices.filter((i) => i.status === "draft");

  return (
    <>
      <PageHeader title="Dashboard" />

      <div className="mx-auto max-w-[80rem] space-y-8 px-4 py-6 md:px-6">
        {/* Every track is minmax(0, ...): a grid item defaults to
            min-width:auto, so without this the column is sized to its widest
            unbreakable row and the whole page scrolls sideways on a phone. */}
        <div className="grid gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-8">
            {/* Hours per project ------------------------------------------ */}
            <section aria-labelledby="hours-heading">
              <SectionTitle className="mb-3" count={hours.length}>
                <span id="hours-heading">Hours this month</span>
              </SectionTitle>
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
                {hours.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Clock}
                    title="No time logged this month"
                    description="Log an entry and this fills in per project."
                    action={
                      <Button asChild variant="secondary" size="sm">
                        <Link href="/app/time/new">
                          <Plus />
                          Log time
                        </Link>
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-[var(--border-subtle)]">
                    {hours.map((row) => {
                      const gap = Math.round((row.hours_worked - row.hours_billed) * 100) / 100;
                      return (
                        <li key={row.id}>
                          <Link
                            href={`/app/projects/${row.slug}/time`}
                            className="flex items-center gap-4 px-4 py-3 transition-colors duration-75 hover:bg-[var(--bg-hover)]"
                          >
                            <div className="min-w-0 flex-1">
                              {/* min-w-0 on the inner flex too, or `truncate`
                                  never engages and the row shoves the hours
                                  column off a narrow screen. */}
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-base font-medium text-[var(--text-primary)]">
                                  {row.name}
                                </span>
                                <Badge tone="neutral">
                                  {billingModelLabel(row.billing_model)}
                                </Badge>
                              </div>
                              <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">
                                {row.client_name}
                              </p>
                              <div className="mt-2 max-w-56">
                                <HoursBar worked={row.hours_worked} billed={row.hours_billed} />
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-base font-medium tabular-nums text-[var(--text-primary)]">
                                {formatHours(row.hours_billed)}
                              </p>
                              <p className="text-xs tabular-nums text-[var(--text-tertiary)]">
                                of {formatHours(row.hours_worked)}
                              </p>
                              {gap > 0 && (
                                <p className="mt-0.5 text-2xs tabular-nums text-[var(--warning-text)]">
                                  −{formatHours(gap)}
                                </p>
                              )}
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* Open work -------------------------------------------------- */}
            <section aria-labelledby="work-heading">
              <SectionTitle className="mb-3" count={openWork.length}>
                <span id="work-heading">Open work by project</span>
              </SectionTitle>
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
                {openWork.length === 0 ? (
                  <EmptyState
                    compact
                    icon={CircleCheck}
                    title="Nothing open"
                    description="Every work item is done or parked."
                  />
                ) : (
                  <ul className="divide-y divide-[var(--border-subtle)]">
                    {openWork.map((row) => (
                      <li key={row.id}>
                        <Link
                          href={`/app/projects/${row.slug}/items`}
                          className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-75 hover:bg-[var(--bg-hover)]"
                        >
                          <span className="min-w-0 flex-1 truncate text-base text-[var(--text-primary)]">
                            {row.name}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5 text-2xs tabular-nums">
                            {row.in_progress > 0 && (
                              <Badge tone="warning">{row.in_progress} in progress</Badge>
                            )}
                            {row.planned > 0 && <Badge tone="info">{row.planned} planned</Badge>}
                            <span className="w-8 text-right text-[var(--text-tertiary)]">
                              {row.open_total}
                            </span>
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
            {/* Client requests -------------------------------------------- */}
            <section aria-labelledby="requests-heading">
              <SectionTitle
                className="mb-3"
                count={requests.total}
                action={<SectionLink href="/app/requests">All</SectionLink>}
              >
                <span id="requests-heading">Client requests</span>
              </SectionTitle>
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
                {requests.items.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Inbox}
                    title="No new requests"
                    description="Requests clients send from the portal land here."
                  />
                ) : (
                  <ul className="divide-y divide-[var(--border-subtle)]">
                    {requests.items.map((request) => (
                      <li key={request.id}>
                        <Link
                          href={`/app/requests?request=${request.id}`}
                          className="block px-4 py-2.5 transition-colors duration-75 hover:bg-[var(--bg-hover)]"
                        >
                          <p className="truncate text-base text-[var(--text-primary)]">
                            {request.title}
                          </p>
                          <p className="mt-0.5 truncate text-2xs text-[var(--text-tertiary)]">
                            {request.project_name} · {request.requester_name} ·{" "}
                            {formatRelative(request.created_at)}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* In progress ------------------------------------------------ */}
            <section aria-labelledby="progress-heading">
              <SectionTitle className="mb-3" count={inProgress.total}>
                <span id="progress-heading">In progress</span>
              </SectionTitle>
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
                {inProgress.items.length === 0 ? (
                  <EmptyState
                    compact
                    icon={CircleDot}
                    title="Nothing in progress"
                    description="Move an item to In progress and it shows up here."
                  />
                ) : (
                  <ul className="divide-y divide-[var(--border-subtle)]">
                    {inProgress.items.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/app/projects/${item.project_slug}/items?item=${item.id}`}
                          className="flex items-start gap-2.5 px-4 py-2.5 transition-colors duration-75 hover:bg-[var(--bg-hover)]"
                        >
                          <TypeIcon type={item.type} className="mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base text-[var(--text-primary)]">
                              {item.title}
                            </p>
                            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs text-[var(--text-tertiary)]">
                              <PriorityDot priority={item.priority} />
                              <span className="truncate">{item.project_name}</span>
                              <span aria-hidden="true">·</span>
                              <span className="shrink-0">{formatRelative(item.updated_at)}</span>
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Invoices --------------------------------------------------- */}
            <section aria-labelledby="invoices-heading">
              <SectionTitle
                className="mb-3"
                count={invoices.length}
                action={<SectionLink href="/app/invoices">All</SectionLink>}
              >
                <span id="invoices-heading">Invoices needing attention</span>
              </SectionTitle>
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
                {invoices.length === 0 ? (
                  <EmptyState
                    compact
                    icon={FileText}
                    title="Nothing outstanding"
                    description={`${drafts.length === 0 ? "No drafts" : `${drafts.length} draft`} and no unpaid invoices.`}
                  />
                ) : (
                  <ul className="divide-y divide-[var(--border-subtle)]">
                    {invoices.map((invoice) => {
                      const meta = INVOICE_STATUS_META[invoice.status];
                      return (
                        <li key={invoice.id}>
                          <Link
                            href={`/app/invoices/${invoice.id}`}
                            className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-75 hover:bg-[var(--bg-hover)]"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-base text-[var(--text-primary)]">
                                {invoice.number ?? "Draft"}
                                <span className="text-[var(--text-tertiary)]">
                                  {" · "}
                                  {invoice.project_name}
                                </span>
                              </p>
                              <p className="mt-0.5 text-2xs text-[var(--text-tertiary)]">
                                {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
                              </p>
                            </div>
                            <span className="shrink-0 text-base font-medium tabular-nums">
                              {formatMoney(invoice.total, invoice.currency)}
                            </span>
                            <Badge tone={meta.tone} className="shrink-0">
                              {meta.label}
                            </Badge>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
