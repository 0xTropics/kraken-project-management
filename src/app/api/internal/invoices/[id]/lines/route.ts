import { internalHandler, parseBody } from "@/lib/api/handler";
import { invoiceLineInput } from "@/lib/api/schemas";
import { addInvoiceLine } from "@/lib/invoices/engine";

export const POST = internalHandler<{ id: string }>(async ({ request, params, session }) => {
  const body = await parseBody(request, invoiceLineInput);
  return addInvoiceLine(params.id, body, session.userId);
});
