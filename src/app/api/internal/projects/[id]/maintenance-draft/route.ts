import { internalHandler } from "@/lib/api/handler";
import { createMaintenanceDraft } from "@/lib/invoices/engine";

type Params = { id: string };

/** Drafts the project's next maintenance term. The period comes from coverage, never from the request. */
export const POST = internalHandler<Params>(async ({ params, session }) =>
  createMaintenanceDraft(params.id, session.userId),
);
