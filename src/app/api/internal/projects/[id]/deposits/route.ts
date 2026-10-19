import { internalHandler, parseBody } from "@/lib/api/handler";
import { depositInput } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { getDepositBalance, recordDeposit } from "@/lib/data/deposits";
import { assertProjectExists } from "@/lib/data/projects";

type Params = { id: string };

export const POST = internalHandler<Params>(async ({ request, params, session }) => {
  const body = await parseBody(request, depositInput);
  await assertProjectExists(params.id);

  const deposit = await recordDeposit(params.id, {
    amount: body.amount,
    received_on: body.received_on,
    method: body.method,
    note: body.note ?? null,
  });

  await appendAudit({
    ...userActor(session),
    projectId: params.id,
    action: "deposit.record",
    entityType: "project_deposit",
    entityId: deposit.id,
    payload: { amount: deposit.amount, received_on: deposit.received_on, method: deposit.method },
  });

  return { deposit, balance: await getDepositBalance(params.id) };
});
