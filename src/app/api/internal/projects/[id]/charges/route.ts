import { internalHandler, parseBody } from "@/lib/api/handler";
import { chargeInput } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import {
  assertManualChargeKind,
  listProjectCharges,
  listUnbilledCharges,
  recordCharge,
} from "@/lib/data/charges";
import { assertProjectExists } from "@/lib/data/projects";

type Params = { id: string };

export const POST = internalHandler<Params>(async ({ request, params, session }) => {
  const body = await parseBody(request, chargeInput);
  assertManualChargeKind(body.kind);
  await assertProjectExists(params.id);

  const charge = await recordCharge(params.id, {
    kind: body.kind,
    description: body.description,
    amount: body.amount,
    taxable: body.taxable,
    incurred_on: body.incurred_on,
    note: body.note ?? null,
  });

  await appendAudit({
    ...userActor(session),
    projectId: params.id,
    action: "charge.record",
    entityType: "project_charge",
    entityId: charge.id,
    payload: { kind: charge.kind, amount: charge.amount, taxable: charge.taxable },
  });

  const [charges, unbilled] = await Promise.all([
    listProjectCharges(params.id),
    listUnbilledCharges(params.id),
  ]);
  return { charge, charges, unbilled };
});
