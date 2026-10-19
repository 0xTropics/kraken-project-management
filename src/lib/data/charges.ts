import { sql, type Db } from "@/lib/db/client";
import { getBuildFeeProgress } from "@/lib/data/maintenance";
import type { BillingModel, ChargeKind, ProjectCharge } from "@/lib/db/types";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { formatMoney, fromCents, toCents } from "@/lib/format";

export interface ChargeInput {
  kind: ChargeKind;
  description: string;
  amount: number;
  taxable: boolean;
  incurred_on: string;
  note: string | null;
}

export interface ChargeWithState extends ProjectCharge {
  invoice_id: string | null;
  invoice_number: string | null;
  /**
   * True when ANY invoice_lines row references this charge, live or void --
   * the FK's actual predicate (`invoice_lines_charge_id_fkey ... on delete
   * restrict`), which is wider than `invoice_id !== null` above. A charge
   * whose only invoice was voided has this true but `invoice_id` null: it
   * re-sweeps onto the next draft (unbilled, by the derived definition), but
   * the FK still blocks deleting it. Do not use this for "is it billed" --
   * `invoice_id` is that signal. This is only for "can it be deleted".
   */
  has_any_line: boolean;
  /** The most recently voided invoice referencing this charge, when one
   * exists and no live line does -- for the void-billed message in the UI. */
  voided_invoice_number: string | null;
}

/**
 * A charge is billed when a line on a non-void invoice points at it. There is
 * no stored flag, so voiding an invoice and deleting a draft both return the
 * charge to unbilled with no release code to forget -- the same property that
 * makes the deposit balance safe to void. This is the single definition of
 * "unbilled"; do not inline the condition anywhere else.
 */
export async function listUnbilledCharges(
  projectId: string,
  db: Db = sql,
): Promise<ProjectCharge[]> {
  return db<ProjectCharge[]>`
    select c.* from project_charges c
    where c.project_id = ${projectId}
      and c.cancelled_at is null
      and not exists (
        select 1 from invoice_lines l
        join invoices i on i.id = l.invoice_id
        where l.charge_id = c.id and i.status <> 'void'
      )
    order by c.incurred_on, c.created_at
  `;
}

/**
 * A charge on a void-and-reissue project has TWO invoice_lines rows -- one on
 * the voided invoice, one on the live one. A plain left join to invoice_lines
 * would match both and emit two rows for that charge. The lateral picks at
 * most one live (non-void) line per charge, so this returns exactly one row
 * per charge regardless of how many times it has been billed and voided.
 */
export async function listProjectCharges(projectId: string): Promise<ChargeWithState[]> {
  return sql<ChargeWithState[]>`
    select c.*, live.invoice_id, live.invoice_number,
           exists (
             select 1 from invoice_lines l2 where l2.charge_id = c.id
           ) as has_any_line,
           voided.invoice_number as voided_invoice_number
    from project_charges c
    left join lateral (
      select i.id as invoice_id, i.number as invoice_number
      from invoice_lines l
      join invoices i on i.id = l.invoice_id
      where l.charge_id = c.id and i.status <> 'void'
      limit 1
    ) live on true
    left join lateral (
      select i.number as invoice_number
      from invoice_lines l
      join invoices i on i.id = l.invoice_id
      where l.charge_id = c.id and i.status = 'void'
      order by i.voided_at desc nulls last, i.created_at desc
      limit 1
    ) voided on true
    where c.project_id = ${projectId}
    order by c.incurred_on desc, c.created_at desc
  `;
}

/**
 * The generic charges route refuses kind `build`: an installment goes through
 * billInstallment, which holds the project lock the cap check needs.
 */
export function assertManualChargeKind(kind: ChargeKind): void {
  if (kind === "build") {
    throw badRequest(
      "Record a build installment from the project's Invoices tab, so the build fee cap applies",
      "use_build_installment",
    );
  }
}

/**
 * A build installment may not take recorded installments past the build fee.
 * Call inside a transaction holding `for update` on the project row --
 * billInstallment does -- or two installments can both pass.
 */
async function assertWithinBuildFee(projectId: string, amount: number, db: Db): Promise<void> {
  const [project] = await db<{ billing_model: BillingModel }[]>`
    select billing_model from projects where id = ${projectId}
  `;
  if (!project) throw notFound("That project no longer exists");
  const progress = await getBuildFeeProgress(projectId, db);
  if (project.billing_model !== "maintenance" || progress.left === null) {
    throw conflict(
      "Only a build + maintenance project with a build fee takes build installments",
      "not_maintenance",
    );
  }
  if (toCents(amount) > toCents(progress.left)) {
    throw conflict(
      `That is more than the ${formatMoney(progress.left, progress.currency)} left to bill on the build fee`,
      "build_fee_exceeded",
    );
  }
}

export async function recordCharge(
  projectId: string,
  input: ChargeInput,
  db: Db = sql,
): Promise<ProjectCharge> {
  if (input.kind === "build") await assertWithinBuildFee(projectId, input.amount, db);
  const [row] = await db<ProjectCharge[]>`
    insert into project_charges ${sql({
      project_id: projectId,
      kind: input.kind,
      description: input.description,
      amount: fromCents(toCents(input.amount)),
      taxable: input.taxable,
      incurred_on: input.incurred_on,
      note: input.note,
    })}
    returning *
  `;
  if (!row) throw new Error("recordCharge: insert returned no row");
  return row;
}

/**
 * Withdraws a charge that cannot be deleted because a voided invoice's frozen
 * line still points at it. It stops sweeping onto drafts and, for `build`,
 * stops counting against the build fee; the voided invoice keeps its line.
 * Refused while any live (non-void) invoice carries it: remove its line from
 * the draft, or void the invoice, first.
 */
export async function cancelCharge(id: string): Promise<void> {
  const [row] = await sql<{ id: string }[]>`
    update project_charges c set cancelled_at = now()
    where c.id = ${id}
      and c.cancelled_at is null
      and not exists (
        select 1 from invoice_lines l
        join invoices i on i.id = l.invoice_id
        where l.charge_id = c.id and i.status <> 'void'
      )
    returning c.id
  `;
  if (!row) {
    throw conflict(
      "This charge is on a live invoice, or already cancelled. Remove its line from the draft, or void the invoice, first.",
      "charge_already_billed",
    );
  }
}

export async function deleteCharge(id: string): Promise<boolean> {
  const rows = await sql`delete from project_charges where id = ${id} returning id`;
  return rows.length > 0;
}
