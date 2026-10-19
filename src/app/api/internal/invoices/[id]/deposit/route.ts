import { internalHandler, parseBody } from "@/lib/api/handler";
import { invoiceDepositInput } from "@/lib/api/schemas";
import { appendAudit, userActor } from "@/lib/audit";
import { sql } from "@/lib/db/client";
import { conflict, notFound } from "@/lib/errors";
import { getInvoiceDetail } from "@/lib/data/invoices";

type Params = { id: string };

/**
 * Sets how much of a project's deposit balance a draft claims. Only a draft
 * can be changed here -- once finalized, `deposit_applied` is frozen by
 * `invoices_guard_immutable`, and `finalizeInvoice` re-validates and clamps it
 * independently, so this route's checks are a courtesy that fails fast rather
 * than the only line of defence.
 *
 * The available-balance check excludes this invoice's own current
 * `deposit_applied` -- otherwise the invoice would compete with itself and the
 * same value could never be re-set. This mirrors `finalizeInvoice`'s
 * `and id <> invoiceId` exclusion in `@/lib/invoices/engine`.
 */
export const PATCH = internalHandler<Params>(async ({ request, params, session }) => {
  const { deposit_applied } = await parseBody(request, invoiceDepositInput);

  await sql.begin(async (tx) => {
    const [invoice] = await tx<{ id: string; project_id: string; status: string; total: number }[]>`
      select id, project_id, status, total from invoices where id = ${params.id} for update
    `;
    if (!invoice) throw notFound("Invoice not found");
    if (invoice.status !== "draft") {
      throw conflict("Only a draft invoice's deposit can be changed", "invoice_immutable");
    }
    if (deposit_applied > Number(invoice.total)) {
      throw conflict("The deposit cannot exceed the invoice total", "deposit_exceeds_total");
    }

    // Locked, mirroring `finalizeInvoice`'s project lock: two drafts on the
    // same project setting `deposit_applied` concurrently each lock only
    // their own invoice row, so without this, each could read a balance that
    // does not yet reflect the other's uncommitted write. Locking the
    // project row serializes deposit accounting across siblings.
    await tx`select id from projects where id = ${invoice.project_id} for update`;

    const [balanceRow] = await tx<{ available: number }[]>`
      select coalesce((select sum(amount) from project_deposits
                       where project_id = ${invoice.project_id}), 0)
           - coalesce((select sum(deposit_applied) from invoices
                       where project_id = ${invoice.project_id}
                         and status <> 'void'
                         and id <> ${params.id}), 0) as available
    `;
    if (deposit_applied > Number(balanceRow?.available ?? 0)) {
      throw conflict("The deposit balance does not cover that amount", "deposit_unavailable");
    }

    const [row] = await tx<{ deposit_applied: number }[]>`
      update invoices set deposit_applied = ${deposit_applied} where id = ${params.id}
      returning deposit_applied
    `;

    await appendAudit(
      {
        ...userActor(session),
        projectId: invoice.project_id,
        action: "invoice.deposit",
        entityType: "invoice",
        entityId: params.id,
        payload: { deposit_applied: row.deposit_applied },
      },
      tx,
    );
  });

  // getInvoiceDetail's select already carries deposit_applied, so the fresh
  // read below reflects what was just set with no merge needed.
  return getInvoiceDetail(params.id);
});
