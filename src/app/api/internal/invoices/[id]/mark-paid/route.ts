import { internalHandler, parseBody } from "@/lib/api/handler";
import { markPaidInput } from "@/lib/api/schemas";
import { markInvoicePaid } from "@/lib/invoices/engine";

export const POST = internalHandler<{ id: string }>(async ({ request, params, session }) => {
  const body = await parseBody(request, markPaidInput);
  await markInvoicePaid(params.id, body.payment_method, body.payment_note ?? null, session.userId);
  return { ok: true };
});
