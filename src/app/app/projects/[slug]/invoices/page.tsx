import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CurrencySummary } from "@/components/invoices/currency-summary";
import { InvoiceTable } from "@/components/invoices/invoice-table";
import { NewInvoiceButton } from "@/components/invoices/new-invoice-button";
import { MaintenancePanel } from "@/components/projects/maintenance-panel";
import { assertNever } from "@/lib/billing-model";
import { getBuildFeeProgress, getMaintenanceStatus } from "@/lib/data/maintenance";
import type { BillingModel } from "@/lib/db/types";
import { getProjectBySlug } from "@/lib/data/projects";
import { invoiceTotalsByCurrency, listProjectInvoices } from "@/lib/data/invoices";
import { addDays, startOfMonth, today } from "@/lib/format";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Invoices" };

/** Last complete calendar month — the period you almost always want. */
function lastMonth(): { start: string; end: string } {
  const end = addDays(startOfMonth(today()), -1);
  return { start: startOfMonth(end), end };
}

function emptyDescription(model: BillingModel): string {
  switch (model) {
    case "hourly":
      return "Raise one for a period and Kraken pulls in every unbilled time entry inside it, with any goodwill written off as its own line.";
    case "retainer":
      return "Raise one for a month and Kraken adds the retainer line for you. Nothing is issued until you finalize the draft.";
    case "maintenance":
      return "Bill a build installment or draft a maintenance term above. Nothing is issued until you finalize the draft.";
    default:
      return assertNever(model);
  }
}

const CHARGES_ONLY =
  "A charges-only draft: every unbilled charge on the project. Maintenance terms and build installments have their own buttons.";

export default async function ProjectInvoicesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireInternalPage();
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const [rows, totals] = await Promise.all([
    listProjectInvoices(project.id),
    invoiceTotalsByCurrency({ projectId: project.id }),
  ]);
  const period = lastMonth();
  const maintenance =
    project.billing_model === "maintenance"
      ? await Promise.all([getBuildFeeProgress(project.id), getMaintenanceStatus(project)])
      : null;
  const newInvoiceDescription = project.billing_model === "maintenance" ? CHARGES_ONLY : undefined;

  return (
    <div className="mx-auto max-w-[76rem] space-y-5 px-4 py-6 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle count={rows.length}>Invoices</SectionTitle>
        <NewInvoiceButton
          projectId={project.id}
          defaultStart={period.start}
          defaultEnd={period.end}
          description={newInvoiceDescription}
        />
      </div>

      {maintenance && (
        <MaintenancePanel
          projectId={project.id}
          currency={project.currency}
          termMonths={project.maintenance_term_months}
          startsOn={project.maintenance_starts_on}
          build={maintenance[0]}
          status={maintenance[1]}
        />
      )}

      {totals.length > 0 && <CurrencySummary totals={totals} />}

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices for this project"
            description={emptyDescription(project.billing_model)}
            action={
              <NewInvoiceButton
                projectId={project.id}
                defaultStart={period.start}
                defaultEnd={period.end}
                label="Draft the first invoice"
                description={newInvoiceDescription}
              />
            }
          />
        ) : (
          <InvoiceTable rows={rows} showProject={false} />
        )}
      </div>
    </div>
  );
}
