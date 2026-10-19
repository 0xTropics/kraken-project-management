import type { Metadata } from "next";
import Link from "next/link";
import { FileText, FolderOpen, SearchX } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CurrencySummary } from "@/components/invoices/currency-summary";
import { InvoiceFilters, type StatusFilter } from "@/components/invoices/invoice-filters";
import { InvoiceTable } from "@/components/invoices/invoice-table";
import { RenewalsDue } from "@/components/invoices/renewals-due";
import { RetainerRunButton } from "@/components/invoices/retainer-run";
import {
  invoiceTotalsByCurrency,
  listInvoices,
  listProjectsWithInvoices,
} from "@/lib/data/invoices";
import { getRetainerRunPreview } from "@/lib/data/dashboard";
import { listRenewalsDue } from "@/lib/data/maintenance";
import { today } from "@/lib/format";
import { CURRENCIES, INVOICE_STATUSES, type Currency } from "@/lib/db/types";
import { one, type Search } from "../search-params";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireInternalPage("/app/invoices");
  const params = await searchParams;

  const rawStatus = one(params.status);
  const status: StatusFilter =
    rawStatus === "outstanding" || (INVOICE_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as StatusFilter)
      : "";
  const projectId = one(params.project);
  const rawCurrency = one(params.currency);
  const currency: Currency | "" = (CURRENCIES as readonly string[]).includes(rawCurrency)
    ? (rawCurrency as Currency)
    : "";

  const scope = {
    projectId: projectId || undefined,
    currency: currency || undefined,
  };

  const [rows, totals, projects, retainer, renewals] = await Promise.all([
    listInvoices({ ...scope, status: status || undefined }),
    // Deliberately not filtered by status: an "outstanding" figure that changes
    // when you filter to `paid` would be answering a question nobody asked.
    invoiceTotalsByCurrency(scope),
    listProjectsWithInvoices(),
    getRetainerRunPreview(),
    listRenewalsDue(today()),
  ]);

  const filtered = Boolean(status || projectId || currency);

  return (
    <>
      <PageHeader
        title="Invoices"
        actions={
          <span className="hidden md:flex">
            <RetainerRunButton preview={retainer} />
          </span>
        }
      />

      <div className="mx-auto max-w-[80rem] space-y-6 px-4 py-6 md:px-6">
        <RenewalsDue renewals={renewals} today={today()} />

        {totals.length > 0 && (
          <section aria-labelledby="totals-heading">
            <SectionTitle className="mb-3">
              <span id="totals-heading">
                {projectId || currency ? "Selected projects" : "Across every project"}
              </span>
            </SectionTitle>
            <CurrencySummary totals={totals} />
          </section>
        )}

        <section aria-labelledby="invoices-heading" className="space-y-3">
          <SectionTitle count={rows.length} action={null}>
            <span id="invoices-heading">Invoices</span>
          </SectionTitle>

          <InvoiceFilters
            status={status}
            projectId={projectId}
            currency={currency}
            projects={projects}
          />

          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
            {rows.length === 0 ? (
              filtered ? (
                <EmptyState
                  compact
                  icon={SearchX}
                  title="Nothing matches these filters"
                  description="Widen the status, project, or currency and the list fills back in."
                  action={
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/app/invoices">Clear filters</Link>
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={FileText}
                  title="No invoices yet"
                  description="Invoices are drafted from a project, for a billing period. Open a project's Invoices tab to raise the first one."
                  action={
                    <Button asChild variant="primary" size="md">
                      <Link href="/app/projects">
                        <FolderOpen />
                        Choose a project
                      </Link>
                    </Button>
                  }
                />
              )
            ) : (
              <InvoiceTable rows={rows} />
            )}
          </div>
        </section>
      </div>
    </>
  );
}
