import { internalHandler } from "@/lib/api/handler";
import { removeInvoiceLine } from "@/lib/invoices/engine";

export const DELETE = internalHandler<{ id: string; lineId: string }>(
  async ({ params, session }) => removeInvoiceLine(params.id, params.lineId, session.userId),
);
