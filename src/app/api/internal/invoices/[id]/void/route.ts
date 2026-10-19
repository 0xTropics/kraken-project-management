import { internalHandler } from "@/lib/api/handler";
import { voidInvoice } from "@/lib/invoices/engine";

/** Releases the time entries this invoice locked. The number is never reused. */
export const POST = internalHandler<{ id: string }>(async ({ params, session }) => {
  await voidInvoice(params.id, session.userId);
  return { ok: true };
});
