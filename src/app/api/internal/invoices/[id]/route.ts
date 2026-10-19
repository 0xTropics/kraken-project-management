import { internalHandler } from "@/lib/api/handler";
import { deleteDraftInvoice } from "@/lib/invoices/engine";

/** Drafts only. Everything else is voided, never removed. */
export const DELETE = internalHandler<{ id: string }>(async ({ params, session }) => {
  await deleteDraftInvoice(params.id, session.userId);
  return null;
});
