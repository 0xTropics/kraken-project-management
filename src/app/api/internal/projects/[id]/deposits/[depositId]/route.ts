import { internalHandler } from "@/lib/api/handler";
import { appendAudit, userActor } from "@/lib/audit";
import { sql } from "@/lib/db/client";
import { conflict, notFound } from "@/lib/errors";
import { deleteDeposit, getDepositBalance } from "@/lib/data/deposits";
import type { ProjectDeposit } from "@/lib/db/types";

type Params = { id: string; depositId: string };

/**
 * A deposit can only be removed while the balance it leaves behind is still
 * non-negative -- otherwise a project's invoices have already drawn down more
 * than what would remain received, and it would owe a balance it never got.
 */
export const DELETE = internalHandler<Params>(async ({ params, session }) => {
  const [deposit] = await sql<ProjectDeposit[]>`
    select * from project_deposits where id = ${params.depositId} and project_id = ${params.id}
  `;
  if (!deposit) throw notFound("That deposit no longer exists");

  const balance = await getDepositBalance(params.id);
  const remainingAfter = Math.round((balance.remaining - deposit.amount) * 100) / 100;
  if (remainingAfter < 0) {
    throw conflict(
      "Removing this deposit would leave the project owing a balance it never received",
      "deposit_would_go_negative",
    );
  }

  const deleted = await deleteDeposit(params.depositId);
  if (!deleted) throw notFound("That deposit no longer exists");

  await appendAudit({
    ...userActor(session),
    projectId: params.id,
    action: "deposit.delete",
    entityType: "project_deposit",
    entityId: params.depositId,
    payload: { amount: deposit.amount },
  });

  return { deleted: params.depositId, balance: await getDepositBalance(params.id) };
});
