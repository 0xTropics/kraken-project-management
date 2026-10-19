import { getInvoicePdfPayload } from "@/lib/data/invoices";
import { attachPdfPath } from "@/lib/invoices/engine";
import { invoicePdfPath, storage } from "@/lib/storage";
import { notFound } from "@/lib/errors";
import { renderInvoicePdf } from "./invoice-pdf";

/**
 * Guarantees a finalized invoice has a PDF in storage, and returns its path.
 *
 * Finalize renders the document immediately, but a storage write is the one
 * step that can fail independently of the database transaction that made the
 * invoice real. Rather than let that failure roll back a correctly-numbered
 * invoice, the path is repaired on demand the next time anyone asks for the
 * document. This also covers seeded and imported invoices.
 */
export async function ensureInvoicePdf(invoiceId: string): Promise<string> {
  const payload = await getInvoicePdfPayload(invoiceId);
  if (!payload) throw notFound("Invoice not found");
  if (!payload.number) {
    throw notFound("A draft invoice has no document until it is finalized");
  }

  const objectPath = invoicePdfPath(payload.projectId, payload.number);
  const existing = await storage().get(objectPath);
  if (existing && existing.byteLength > 0) {
    await attachPdfPath(invoiceId, objectPath);
    return objectPath;
  }

  const bytes = await renderInvoicePdf(payload.data, payload.lines);
  await storage().put(objectPath, bytes, "application/pdf");
  await attachPdfPath(invoiceId, objectPath);
  return objectPath;
}
