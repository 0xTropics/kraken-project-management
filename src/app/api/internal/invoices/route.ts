import { internalHandler, parseBody } from "@/lib/api/handler";
import { invoiceCreateInput } from "@/lib/api/schemas";
import { createDraftInvoice } from "@/lib/invoices/engine";
import { listInvoices } from "@/lib/data/invoices";
import type { InvoiceStatus } from "@/lib/db/types";

export const GET = internalHandler(async ({ searchParams }) => {
  const status = searchParams.get("status");
  return listInvoices({
    projectId: searchParams.get("project_id") ?? undefined,
    status: (status as InvoiceStatus | null) ?? undefined,
  });
});

export const POST = internalHandler(async ({ request, session }) => {
  const body = await parseBody(request, invoiceCreateInput);
  return createDraftInvoice({
    projectId: body.project_id,
    periodStart: body.period_start,
    periodEnd: body.period_end,
    notes: body.notes ?? null,
    actorId: session.userId,
  });
});
