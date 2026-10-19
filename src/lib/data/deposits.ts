import { sql, type Db } from "@/lib/db/client";
import type { PaymentMethod, ProjectDeposit } from "@/lib/db/types";

export async function listProjectDeposits(projectId: string): Promise<ProjectDeposit[]> {
  return sql<ProjectDeposit[]>`
    select * from project_deposits
    where project_id = ${projectId}
    order by received_on desc, created_at desc
  `;
}

export interface DepositBalance {
  received: number;
  applied: number;
  remaining: number;
}

/**
 * Never stored. A voided invoice drops out of the applied sum, so its deposit
 * returns to the balance with no code path to forget -- the same shape as
 * voiding releasing the time entries it locked.
 */
export async function getDepositBalance(projectId: string, db: Db = sql): Promise<DepositBalance> {
  const [row] = await db<{ received: number; applied: number }[]>`
    select
      coalesce((select sum(amount) from project_deposits
                where project_id = ${projectId}), 0)::float8 as received,
      coalesce((select sum(deposit_applied) from invoices
                where project_id = ${projectId} and status <> 'void'), 0)::float8 as applied
  `;
  const received = row?.received ?? 0;
  const applied = row?.applied ?? 0;
  return { received, applied, remaining: Math.round((received - applied) * 100) / 100 };
}

export async function recordDeposit(
  projectId: string,
  input: { amount: number; received_on: string; method: PaymentMethod; note: string | null },
): Promise<ProjectDeposit> {
  const [row] = await sql<ProjectDeposit[]>`
    insert into project_deposits ${sql({
      project_id: projectId,
      amount: input.amount,
      received_on: input.received_on,
      method: input.method,
      note: input.note,
    })}
    returning *
  `;
  if (!row) throw new Error("recordDeposit: insert returned no row");
  return row;
}

export async function deleteDeposit(id: string): Promise<boolean> {
  const rows = await sql`delete from project_deposits where id = ${id} returning id`;
  return rows.length > 0;
}
