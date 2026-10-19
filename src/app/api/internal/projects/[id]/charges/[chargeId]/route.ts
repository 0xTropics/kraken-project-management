import { internalHandler } from "@/lib/api/handler";
import { appendAudit, userActor } from "@/lib/audit";
import { sql } from "@/lib/db/client";
import { conflict, notFound } from "@/lib/errors";
import {
  cancelCharge,
  deleteCharge,
  listProjectCharges,
  listUnbilledCharges,
} from "@/lib/data/charges";

type Params = { id: string; chargeId: string };

export const DELETE = internalHandler<Params>(async ({ params, session }) => {
  const [charge] = await sql<{ id: string; amount: number }[]>`
    select id, amount from project_charges
    where id = ${params.chargeId} and project_id = ${params.id}
  `;
  if (!charge) throw notFound("That charge no longer exists");

  // on delete restrict would reject this anyway -- and it does so on ANY
  // referencing line, void or not. Checking first turns that raw foreign-key
  // error into a sentence the operator can act on, but the check has to match
  // the FK's actual predicate, not the narrower "live" definition of billed
  // that listUnbilledCharges/listProjectCharges use. Order so a live line (if
  // any) sorts first: a void-and-reissue charge can have both a void row and
  // a live one, and the live case's message ("remove its line") is the one
  // that applies then.
  const [line] = await sql<{ id: string; status: string; number: string | null }[]>`
    select l.id, i.status, i.number from invoice_lines l
    join invoices i on i.id = l.invoice_id
    where l.charge_id = ${params.chargeId}
    order by (i.status = 'void'), i.created_at desc
    limit 1
  `;
  if (line && line.status !== "void") {
    throw conflict(
      "This charge is on an invoice. Remove its line from the draft, or void the invoice, first.",
      "charge_already_billed",
    );
  }

  // Only voided invoices reference it. The row cannot be deleted -- a void
  // invoice's lines are frozen and the FK restricts -- so it is withdrawn
  // instead: it stops sweeping onto drafts and, for a build installment, stops
  // counting against the build fee. Without this, a mistyped charge came back
  // onto every later draft forever.
  const voidOnly = line !== undefined;
  if (voidOnly) await cancelCharge(charge.id);
  else await deleteCharge(charge.id);

  await appendAudit({
    ...userActor(session),
    projectId: params.id,
    action: voidOnly ? "charge.cancel" : "charge.delete",
    entityType: "project_charge",
    entityId: charge.id,
    payload: { amount: charge.amount, voided_invoice: voidOnly ? line?.number ?? null : undefined },
  });

  const [charges, unbilled] = await Promise.all([
    listProjectCharges(params.id),
    listUnbilledCharges(params.id),
  ]);
  return { charges, unbilled };
});
