import { internalHandler } from "@/lib/api/handler";
import { retainerCandidates } from "@/lib/data/invoices";
import { maintenanceRunCandidates } from "@/lib/data/maintenance";
import { createDraftInvoice, createMaintenanceDraft } from "@/lib/invoices/engine";
import { endOfMonth, startOfMonth, today } from "@/lib/format";

/**
 * One click creates this month's draft retainer invoice for every active
 * retainer project that does not already have one covering the period, and
 * this month's maintenance invoice for every monthly-term maintenance project
 * not yet covered. Idempotent — running it twice creates nothing the second
 * time.
 */
export const POST = internalHandler(async ({ session }) => {
  const periodStart = startOfMonth(today());
  const periodEnd = endOfMonth(today());
  const candidates = await retainerCandidates(periodStart, periodEnd);

  const created: { project: string; invoice_id: string }[] = [];
  const skipped: { project: string; reason: string }[] = [];

  for (const candidate of candidates) {
    if (candidate.existing_invoice_id) {
      skipped.push({
        project: candidate.name,
        reason: candidate.existing_number
          ? `already invoiced as ${candidate.existing_number}`
          : "a draft already covers this period",
      });
      continue;
    }
    const invoice = await createDraftInvoice({
      projectId: candidate.id,
      periodStart,
      periodEnd,
      actorId: session.userId,
    });
    created.push({ project: candidate.name, invoice_id: invoice.id });
  }

  // Monthly-term maintenance. Prepaid terms are never drafted here: they are
  // flagged in Renewals due and drafted by hand once the client confirms.
  const maintenance = await maintenanceRunCandidates(periodStart);
  for (const candidate of maintenance.due) {
    const invoice = await createMaintenanceDraft(candidate.id, session.userId);
    created.push({ project: candidate.name, invoice_id: invoice.id });
  }

  return { period: { start: periodStart, end: periodEnd }, created, skipped };
});
