import { internalHandler, parseBody } from "@/lib/api/handler";
import { buildInstallmentInput } from "@/lib/api/schemas";
import { billInstallment } from "@/lib/invoices/engine";

type Params = { id: string };

/** Records a build installment and drafts its invoice; the cap is checked under the project lock. */
export const POST = internalHandler<Params>(async ({ request, params, session }) => {
  const body = await parseBody(request, buildInstallmentInput);
  return billInstallment(params.id, body, session.userId);
});
