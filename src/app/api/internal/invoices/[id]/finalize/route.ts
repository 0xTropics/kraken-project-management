import { internalHandler } from "@/lib/api/handler";
import { finalizeInvoice } from "@/lib/invoices/engine";
import { ensureInvoicePdf } from "@/lib/pdf/ensure";

/**
 * Finalize is the irreversible step: it assigns the number, freezes the
 * totals, and locks the period's time entries.
 *
 * The PDF is rendered *after* the transaction commits — a storage write inside
 * a database transaction would hold a connection open across the network, and a
 * storage failure must not roll back a correctly-numbered invoice. If the
 * render fails here the invoice is still valid and `ensureInvoicePdf` repairs
 * it the next time the document is requested.
 */
export const POST = internalHandler<{ id: string }>(async ({ params, session }) => {
  await finalizeInvoice(params.id, session.userId);
  try {
    await ensureInvoicePdf(params.id);
  } catch (error) {
    console.error("[kraken] invoice finalized but the PDF did not render:", error);
  }
  return { ok: true };
});
