import { z } from "zod";
import { internalHandler, parseBody } from "@/lib/api/handler";
import { setInvoicePublished } from "@/lib/invoices/engine";

/** Publication is a separate, reversible decision from finalizing. */
export const POST = internalHandler<{ id: string }>(async ({ request, params, session }) => {
  const { published } = await parseBody(request, z.object({ published: z.boolean() }));
  await setInvoicePublished(params.id, published, session.userId);
  return { ok: true };
});
