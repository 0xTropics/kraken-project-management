import { internalHandler } from "@/lib/api/handler";
import { sweepChargesOntoDraft } from "@/lib/invoices/engine";

type Params = { id: string };

export const POST = internalHandler<Params>(async ({ params, session }) => {
  const invoice = await sweepChargesOntoDraft(params.id, session.userId);
  return { invoice };
});
