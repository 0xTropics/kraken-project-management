import { sql, type Db } from "@/lib/db/client";
import { appendAudit } from "@/lib/audit";
import { assertNever } from "@/lib/billing-model";
import { listUnbilledCharges, recordCharge } from "@/lib/data/charges";
import { getDepositBalance } from "@/lib/data/deposits";
import { getCoveredPeriods } from "@/lib/data/maintenance";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { fromCents, toCents, today } from "@/lib/format";
import { maintenanceLines, nextTermPeriod } from "@/lib/invoices/maintenance";
import { computeTotals, type TotalsLine } from "@/lib/invoices/totals";
import type {
  DateString,
  Invoice,
  InvoiceLine,
  InvoiceLineKind,
  PaymentMethod,
  Project,
  ProjectCharge,
  TimeEntry,
} from "@/lib/db/types";

/**
 * Invoice lifecycle.
 *
 *   draft --finalize--> sent --mark paid--> paid
 *     |                   |
 *     +--delete           +--void--> void
 *
 * Finalize is the point of no return: it assigns the number, freezes the
 * totals, writes the PDF, and locks the attached time entries. Everything after
 * that is a status move. The database enforces the freeze independently (see
 * 20260901000200_invoicing.sql), so a bug here cannot quietly rewrite history.
 */

export interface InvoiceWithLines extends Invoice {
  lines: InvoiceLine[];
}

async function recomputeAndStore(tx: Db, invoiceId: string): Promise<void> {
  const [invoice] = await tx<{ tax_rate: number; status: string }[]>`
    select tax_rate, status from invoices where id = ${invoiceId}
  `;
  if (!invoice) throw notFound("Invoice not found");
  if (invoice.status !== "draft") throw conflict("Invoice is finalized", "invoice_immutable");

  const lines = await tx<TotalsLine[]>`
    select amount, taxable from invoice_lines where invoice_id = ${invoiceId}
  `;
  const totals = computeTotals(lines, invoice.tax_rate);
  await tx`
    update invoices
    set subtotal = ${totals.subtotal}, tax_amount = ${totals.tax_amount}, total = ${totals.total}
    where id = ${invoiceId}
  `;
}

/* -------------------------------------------------------------------------- */
/* Creation                                                                    */
/* -------------------------------------------------------------------------- */

export interface CreateDraftInput {
  projectId: string;
  periodStart: string;
  periodEnd: string;
  notes?: string | null;
  actorId: string;
}

/**
 * Builds a draft from the period's unbilled time (hourly) or a single retainer
 * line (retainer). Nothing is locked yet -- a draft can be edited or deleted.
 */
export async function createDraftInvoice(input: CreateDraftInput): Promise<InvoiceWithLines> {
  if (input.periodEnd < input.periodStart) {
    throw badRequest("The period ends before it starts");
  }

  return sql.begin(async (tx) => {
    // Locked for the same reason `finalizeInvoice` and the deposit PATCH
    // route lock it: this transaction reads the deposit balance below and
    // auto-claims from it. Two drafts created concurrently for the same
    // project would otherwise each read the same unlocked balance and each
    // auto-claim up to their own total, double-assigning the leftover --
    // this is the one auto-claiming write site the finding didn't name, but
    // it is the same bug in the same subsystem, so it gets the same lock.
    const [project] = await tx<Project[]>`
      select * from projects where id = ${input.projectId} and archived_at is null for update
    `;
    if (!project) throw notFound("Project not found");

    const entries = await tx<TimeEntry[]>`
      select * from time_entries
      where project_id = ${project.id}
        and invoice_id is null
        and date >= ${input.periodStart}
        and date <= ${input.periodEnd}
      order by date, created_at
    `;

    return buildDraft(tx, project, {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      notes: input.notes ?? null,
      actorId: input.actorId,
      baseLines: periodLines(project, entries, input.periodStart, input.periodEnd),
    });
  });
}

/** A line the engine is about to insert. */
interface DraftLine {
  kind: InvoiceLineKind;
  description: string;
  quantity: number;
  unit: number;
  taxable?: boolean;
  charge_id?: string | null;
}

/**
 * Appends lines after the invoice's last one. The amount is always derived
 * here, in whole cents, from unit × quantity -- the one place a line's money
 * is computed.
 */
async function insertLines(tx: Db, invoiceId: string, lines: DraftLine[]): Promise<void> {
  const [next] = await tx<{ next: number }[]>`
    select coalesce(max(sort_order) + 1, 0) as next from invoice_lines where invoice_id = ${invoiceId}
  `;
  if (!next) throw new Error("insertLines: sort_order query returned no row");
  for (const [offset, line] of lines.entries()) {
    await tx`
      insert into invoice_lines (invoice_id, kind, description, quantity, unit_amount, amount,
                                 sort_order, taxable, charge_id)
      values (${invoiceId}, ${line.kind}, ${line.description}, ${line.quantity},
              ${line.unit}, ${fromCents(Math.round(toCents(line.unit) * line.quantity))},
              ${next.next + offset}, ${line.taxable ?? true}, ${line.charge_id ?? null})
    `;
  }
}

/**
 * The line that bills a charge. Build charges are tagged "Build" on the
 * client's invoice; every other charge is "Additional". `charge_id`, not the
 * kind, is what marks a line as a charge.
 */
function chargeLine(charge: ProjectCharge): DraftLine {
  return {
    kind: charge.kind === "build" ? "build" : "adhoc",
    description: `${charge.incurred_on} — ${charge.description}`,
    quantity: 1,
    unit: charge.amount,
    taxable: charge.taxable,
    charge_id: charge.id,
  };
}

/**
 * The lines a period contributes before charges, by billing model. Exhaustive:
 * a fourth model fails typecheck here rather than falling into another's lines.
 */
function periodLines(
  project: Project,
  entries: TimeEntry[],
  periodStart: DateString,
  periodEnd: DateString,
): DraftLine[] {
  switch (project.billing_model) {
    case "hourly": {
      const lines: DraftLine[] = [];
      const rate = project.hourly_rate ?? 0;
      for (const entry of entries) {
        const entryRate = entry.rate_override ?? rate;
        const label = entry.description?.trim() || "Development work";
        // The client is shown the hours actually worked, then the goodwill
        // written off beneath it, so the two numbers reconcile to what they
        // are charged.
        lines.push({
          kind: "time",
          description: `${entry.date} — ${label}`,
          quantity: entry.hours_worked,
          unit: entryRate,
        });
        const gap = Math.round((entry.hours_worked - entry.hours_billed) * 100) / 100;
        if (gap > 0) {
          lines.push({
            kind: "discount",
            description: entry.discount_reason?.trim()
              ? `Goodwill discount — ${entry.discount_reason.trim()}`
              : "Goodwill discount",
            quantity: -gap,
            unit: entryRate,
          });
        }
      }
      return lines;
    }
    case "retainer": {
      const lines: DraftLine[] = [
        {
          kind: "retainer",
          description: `Monthly retainer — ${periodStart} to ${periodEnd}`,
          quantity: 1,
          unit: project.retainer_amount ?? 0,
        },
      ];
      // The hours-worked line is off unless the project opts in with
      // retainer_show_hours, and informational (zero value) when it is on.
      if (project.retainer_show_hours && entries.length > 0) {
        const hours =
          Math.round(entries.reduce((sum, e) => sum + e.hours_worked, 0) * 100) / 100;
        lines.push({
          kind: "adhoc",
          description: `Hours worked this period (included in retainer): ${hours}`,
          quantity: hours,
          unit: 0,
        });
      }
      return lines;
    }
    case "maintenance":
      // Charges only. A maintenance term is drafted by createMaintenanceDraft,
      // which derives its period from coverage; a hand-picked period here would
      // let two invoices claim overlapping months.
      return [];
    default:
      return assertNever(project.billing_model);
  }
}

/**
 * Everything a draft does once its base lines are chosen: insert the invoice,
 * sweep every unbilled charge onto it, insert the lines, total them, and
 * auto-claim the deposit. Shared by every way a draft is made, so the money
 * path exists once. The caller must already hold `for update` on the project
 * row -- that lock serialises two drafts racing for the same charges, the same
 * deposit, and the same maintenance term.
 *
 * Ordering is load-bearing: charges join the line set before
 * recomputeAndStore, and the deposit claim reads `total` after it.
 */
async function buildDraft(
  tx: Db,
  project: Project,
  input: {
    periodStart: DateString;
    periodEnd: DateString;
    notes: string | null;
    actorId: string;
    baseLines: DraftLine[];
    auditPayload?: Record<string, unknown>;
  },
): Promise<InvoiceWithLines> {
  const [invoice] = await tx<Invoice[]>`
    insert into invoices (project_id, status, period_start, period_end, currency,
                          tax_rate, notes, payment_instructions)
    values (${project.id}, 'draft', ${input.periodStart}, ${input.periodEnd},
            ${project.currency}, ${project.tax_rate}, ${input.notes},
            ${project.payment_instructions})
    returning *
  `;
  if (!invoice) throw new Error("buildDraft: invoice insert returned no row");

  // Every unbilled charge, whatever its date. Charges are discrete events,
  // not time-bucketed hours: a cost incurred in January for work invoiced in
  // August belongs on that invoice, and a period-scoped sweep would strand it
  // forever. The project row is locked by the caller, which serialises two
  // drafts racing for the same charge.
  const charges = await listUnbilledCharges(project.id, tx);
  const lines = [...input.baseLines, ...charges.map(chargeLine)];
  await insertLines(tx, invoice.id, lines);

  await recomputeAndStore(tx, invoice.id);

  // A deposit applies after tax, against the invoice's total -- never as a
  // line, which would shrink the taxable subtotal. Read on `tx`: the balance
  // must reflect this transaction's own view, not a stale read from the
  // global pool.
  const [stored] = await tx<{ total: number }[]>`
    select total from invoices where id = ${invoice.id}
  `;
  if (!stored) throw new Error("buildDraft: invoice vanished before the deposit claim");
  const balance = await getDepositBalance(project.id, tx);
  const applied = Math.min(balance.remaining, stored.total);
  await tx`
    update invoices set deposit_applied = ${applied} where id = ${invoice.id}
  `;

  await appendAudit(
    {
      actorType: "user",
      actorId: input.actorId,
      projectId: project.id,
      action: "invoice.create",
      entityType: "invoice",
      entityId: invoice.id,
      payload: {
        period_start: input.periodStart,
        period_end: input.periodEnd,
        lines: lines.length,
        ...input.auditPayload,
      },
    },
    tx,
  );

  return loadInvoice(tx, invoice.id);
}

/**
 * Drafts a project's next maintenance term. The period is never supplied: it
 * runs from the day after coverage (or the start month, if later) for the
 * project's current term. Changing the term or price only affects the next
 * draft; issued invoices are frozen.
 */
export async function createMaintenanceDraft(
  projectId: string,
  actorId: string,
): Promise<InvoiceWithLines> {
  return sql.begin(async (tx) => {
    // The same lock createDraftInvoice takes: it serialises two drafts racing
    // for the same term, and for the same deposit and charges.
    const [project] = await tx<Project[]>`
      select * from projects where id = ${projectId} and archived_at is null for update
    `;
    if (!project) throw notFound("Project not found");
    if (project.billing_model !== "maintenance" || project.maintenance_monthly === null) {
      throw conflict("Only a build + maintenance project has maintenance terms", "not_maintenance");
    }
    if (project.maintenance_starts_on === null) {
      throw conflict(
        "Set the month maintenance starts before drafting a term",
        "maintenance_not_started",
      );
    }

    const covered = await getCoveredPeriods(project.id, tx);
    const period = nextTermPeriod(
      covered,
      project.maintenance_starts_on,
      project.maintenance_term_months,
    );

    return buildDraft(tx, project, {
      periodStart: period.start,
      periodEnd: period.end,
      notes: null,
      actorId,
      baseLines: maintenanceLines(
        {
          maintenance_monthly: project.maintenance_monthly,
          maintenance_price_6: project.maintenance_price_6,
          maintenance_price_12: project.maintenance_price_12,
        },
        period,
      ),
      auditPayload: { maintenance_months: period.months },
    });
  });
}

/**
 * Records a build installment and drafts its invoice in one transaction. The
 * draft is charges-only and dated today; like every draft it sweeps any other
 * unbilled charges too. The cap is checked by recordCharge under this lock.
 */
export async function billInstallment(
  projectId: string,
  input: { amount: number; description: string },
  actorId: string,
): Promise<InvoiceWithLines> {
  return sql.begin(async (tx) => {
    const [project] = await tx<Project[]>`
      select * from projects where id = ${projectId} and archived_at is null for update
    `;
    if (!project) throw notFound("Project not found");

    const day = today();
    const charge = await recordCharge(
      project.id,
      {
        kind: "build",
        description: input.description,
        amount: fromCents(toCents(input.amount)),
        taxable: true,
        incurred_on: day,
        note: null,
      },
      tx,
    );
    await appendAudit(
      {
        actorType: "user",
        actorId,
        projectId: project.id,
        action: "charge.record",
        entityType: "project_charge",
        entityId: charge.id,
        payload: { kind: "build", amount: charge.amount },
      },
      tx,
    );

    return buildDraft(tx, project, {
      periodStart: day,
      periodEnd: day,
      notes: null,
      actorId,
      baseLines: [],
      auditPayload: { build_installment: charge.id },
    });
  });
}

async function loadInvoice(tx: Db, invoiceId: string): Promise<InvoiceWithLines> {
  const [invoice] = await tx<Invoice[]>`select * from invoices where id = ${invoiceId}`;
  if (!invoice) throw notFound("Invoice not found");
  const lines = await tx<InvoiceLine[]>`
    select * from invoice_lines where invoice_id = ${invoiceId} order by sort_order, created_at
  `;
  return { ...invoice, lines };
}

export async function getInvoice(invoiceId: string): Promise<InvoiceWithLines> {
  return loadInvoice(sql, invoiceId);
}

/* -------------------------------------------------------------------------- */
/* Draft editing                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Line kinds only the engine writes. A hand-added maintenance line would mark
 * its invoice as maintenance coverage and silently skip a month; a hand-added
 * build line would have no charge behind it and no build-fee cap applied.
 */
const ENGINE_ONLY_LINE_KINDS: readonly InvoiceLineKind[] = ["maintenance", "build"];

export async function addInvoiceLine(
  invoiceId: string,
  line: {
    kind: InvoiceLineKind;
    description: string;
    quantity: number;
    unit_amount: number;
    taxable?: boolean;
    charge_id?: string | null;
  },
  actorId: string,
): Promise<InvoiceWithLines> {
  if (ENGINE_ONLY_LINE_KINDS.includes(line.kind)) {
    throw badRequest(
      "Maintenance and build lines are added by Kraken, not by hand",
      "engine_line_kind",
    );
  }
  return sql.begin(async (tx) => {
    await insertLines(tx, invoiceId, [{ ...line, unit: line.unit_amount }]);
    await recomputeAndStore(tx, invoiceId);
    await appendAudit(
      { actorType: "user", actorId, action: "invoice.line.add", entityType: "invoice", entityId: invoiceId, payload: line },
      tx,
    );
    return loadInvoice(tx, invoiceId);
  });
}

/**
 * Pulls charges recorded after the draft was created onto it. Without this the
 * only way to pick up a late charge would be to delete and recreate the draft.
 * Takes the same project lock createDraftInvoice takes, for the same reason.
 */
export async function sweepChargesOntoDraft(
  invoiceId: string,
  actorId: string,
): Promise<InvoiceWithLines> {
  return sql.begin(async (tx) => {
    const [invoice] = await tx<{ project_id: string; status: string }[]>`
      select project_id, status from invoices where id = ${invoiceId}
    `;
    if (!invoice) throw notFound("Invoice not found");
    if (invoice.status !== "draft") {
      throw conflict("Invoice is finalized", "invoice_immutable");
    }
    await tx`select id from projects where id = ${invoice.project_id} for update`;

    const charges = await listUnbilledCharges(invoice.project_id, tx);
    await insertLines(tx, invoiceId, charges.map(chargeLine));

    await recomputeAndStore(tx, invoiceId);
    // Deliberately no deposit auto-claim here, unlike createDraftInvoice
    // (the claim in buildDraft). A draft at total 500 with deposit_applied 400 that
    // sweeps a 200 charge ends at total 700, deposit_applied still 400 --
    // the deposit sits unused and visible rather than being silently
    // re-claimed. This matches addInvoiceLine, which has the same gap for the
    // same reason: it fails in the safe direction (more billed, not less),
    // the operator can adjust deposit_applied through the control the draft
    // editor already exposes, and finalizeInvoice clamps deposit_applied to
    // the invoice's total regardless. A second auto-claim site here would put
    // more surface on the money path than this case is worth. Do not add one
    // without re-deriving that tradeoff.
    await appendAudit(
      {
        actorType: "user",
        actorId,
        action: "invoice.charges.sweep",
        entityType: "invoice",
        entityId: invoiceId,
        payload: { swept: charges.length },
      },
      tx,
    );
    return loadInvoice(tx, invoiceId);
  });
}

export async function removeInvoiceLine(
  invoiceId: string,
  lineId: string,
  actorId: string,
): Promise<InvoiceWithLines> {
  return sql.begin(async (tx) => {
    const result = await tx`
      delete from invoice_lines where id = ${lineId} and invoice_id = ${invoiceId}
    `;
    if (result.count === 0) throw notFound("Line not found on this invoice");
    await recomputeAndStore(tx, invoiceId);
    await appendAudit(
      { actorType: "user", actorId, action: "invoice.line.remove", entityType: "invoice", entityId: invoiceId, payload: { lineId } },
      tx,
    );
    return loadInvoice(tx, invoiceId);
  });
}

export async function deleteDraftInvoice(invoiceId: string, actorId: string): Promise<void> {
  await sql.begin(async (tx) => {
    const [invoice] = await tx<Invoice[]>`select * from invoices where id = ${invoiceId}`;
    if (!invoice) throw notFound("Invoice not found");
    if (invoice.status !== "draft") {
      throw conflict("Only draft invoices can be deleted", "invoice_immutable");
    }
    await appendAudit(
      { actorType: "user", actorId, projectId: invoice.project_id, action: "invoice.delete", entityType: "invoice", entityId: invoiceId, payload: {} },
      tx,
    );
    await tx`delete from invoices where id = ${invoiceId}`;
  });
}

/* -------------------------------------------------------------------------- */
/* Numbering                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `YYYY-NNN`, sequential within the year. The counter row is locked by the
 * upsert, so two concurrent finalizes queue rather than collide, and the unique
 * index on invoices.number is the backstop.
 */
async function allocateNumber(tx: Db, year: number): Promise<string> {
  const [row] = await tx<{ last_number: number }[]>`
    insert into invoice_counters (year, last_number) values (${year}, 1)
    on conflict (year) do update set last_number = invoice_counters.last_number + 1
    returning last_number
  `;
  return `${year}-${String(row.last_number).padStart(3, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* Finalize                                                                    */
/* -------------------------------------------------------------------------- */

export interface FinalizeResult {
  invoice: InvoiceWithLines;
  project: Project;
}

/**
 * Assigns the number, freezes the totals, and locks the period's time entries.
 * The PDF is rendered by the caller *after* this transaction commits, because a
 * storage write must not sit inside a database transaction; `pdf_path` is set
 * by `attachPdfPath` immediately afterwards.
 */
export async function finalizeInvoice(
  invoiceId: string,
  actorId: string,
): Promise<FinalizeResult> {
  return sql.begin(async (tx) => {
    const [invoice] = await tx<Invoice[]>`
      select * from invoices where id = ${invoiceId} for update
    `;
    if (!invoice) throw notFound("Invoice not found");
    if (invoice.status !== "draft") {
      throw conflict("This invoice is already finalized", "invoice_immutable");
    }

    const lines = await tx<InvoiceLine[]>`
      select * from invoice_lines where invoice_id = ${invoiceId} order by sort_order
    `;
    if (lines.length === 0) {
      throw badRequest("An invoice needs at least one line before it can be finalized");
    }

    // Locked (not just selected), matching the same lock taken by the
    // deposit PATCH route and by createDraftInvoice's own auto-claim. This
    // finalize only ever reads and clamps *down* this invoice's own already-
    // committed `deposit_applied`, so two finalizes racing each other can't
    // by themselves inflate what's spent -- but the balance read just below
    // sums every sibling's `deposit_applied` (draft or sent) unlocked, and a
    // draft PATCH or another createDraftInvoice call *can* raise a sibling's
    // claim concurrently with this check. Locking the project row here
    // serializes this read against any such concurrent claim on the same
    // project, the same way it does for those two write sites.
    const [project] = await tx<Project[]>`
      select * from projects where id = ${invoice.project_id} for update
    `;
    if (!project) throw notFound("Project not found");

    // The draft may have been built days ago and another invoice may have consumed
    // the balance since. Its own applied amount is excluded from the check, or the
    // invoice would be competing with itself.
    const [balanceRow] = await tx<{ available: number }[]>`
      select coalesce((select sum(amount) from project_deposits
                       where project_id = ${project.id}), 0)
           - coalesce((select sum(deposit_applied) from invoices
                       where project_id = ${project.id}
                         and status <> 'void'
                         and id <> ${invoiceId}), 0) as available
    `;
    if (Number(invoice.deposit_applied) > Number(balanceRow?.available ?? 0)) {
      throw conflict(
        "The deposit balance no longer covers this invoice",
        "deposit_unavailable",
      );
    }

    const totals = computeTotals(lines, invoice.tax_rate);
    // Unconditional cap: a deposit is never worth more than the invoice it is
    // applied to. A line removed after the draft's deposit was set (e.g. via
    // removeInvoiceLine) can shrink the total below what was applied, and the
    // balance check above does not catch that -- it only checks against the
    // deposit pool, not against this invoice's own total. Clamp rather than
    // reject: a rejection would leave the operator with no obvious remedy,
    // while clamping cannot produce a wrong invoice and leaves the unused
    // remainder available on the project. Floored at 0 as well as capped at
    // the total: nothing requires `invoices.total >= 0` (a line's
    // `unit_amount` can go negative), and an invoice whose lines net negative
    // would otherwise clamp `deposit_applied` below zero and violate the
    // `deposit_applied >= 0` check constraint -- even with no deposit
    // recorded at all, since `Math.min(0, negativeTotal)` is negative.
    const depositApplied = Math.max(0, Math.min(Number(invoice.deposit_applied), totals.total));
    const number = await allocateNumber(tx, new Date().getUTCFullYear());

    // Freeze who this invoice was billed to. Read on `tx`, not via
    // `getPrimaryContact` -- that helper closes over the global `sql` pool and
    // would run on a different connection, outside the `for update` lock this
    // transaction holds on the invoice row.
    const [billTo] = await tx<
      { name: string; contact_name: string | null; contact_email: string | null }[]
    >`
      select c.name,
             pc.name  as contact_name,
             pc.email as contact_email
      from clients c
      left join client_contacts pc on pc.client_id = c.id and pc.is_primary
      where c.id = ${project.client_id}
    `;

    await tx`
      update invoices
      set status = 'sent', number = ${number}, finalized_at = now(), sent_at = now(),
          subtotal = ${totals.subtotal}, tax_amount = ${totals.tax_amount}, total = ${totals.total},
          deposit_applied = ${depositApplied},
          bill_to_name          = ${billTo?.name ?? null},
          bill_to_contact_name  = ${billTo?.contact_name ?? null},
          bill_to_contact_email = ${billTo?.contact_email ?? null}
      where id = ${invoiceId}
    `;

    // Locking is what makes the invoice a historical record: these entries can
    // no longer be edited or deleted (enforced by trigger).
    const locked = await tx`
      update time_entries
      set invoice_id = ${invoiceId}
      where project_id = ${project.id}
        and invoice_id is null
        and date >= ${invoice.period_start}
        and date <= ${invoice.period_end}
    `;

    await appendAudit(
      {
        actorType: "user",
        actorId,
        projectId: project.id,
        action: "invoice.finalize",
        entityType: "invoice",
        entityId: invoiceId,
        payload: { number, total: totals.total, locked_time_entries: locked.count },
      },
      tx,
    );

    return { invoice: await loadInvoice(tx, invoiceId), project };
  });
}

/**
 * Records where the finalized PDF landed. Deliberately the only column update
 * permitted on a finalized invoice besides the lifecycle ones, and it is
 * allowed exactly once -- a second call would be an attempt to swap the
 * document under a number that has already gone out.
 */
export async function attachPdfPath(invoiceId: string, pdfPath: string): Promise<void> {
  await sql`
    update invoices set pdf_path = ${pdfPath}
    where id = ${invoiceId} and pdf_path is null
  `;
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                   */
/* -------------------------------------------------------------------------- */

export async function markInvoicePaid(
  invoiceId: string,
  method: PaymentMethod,
  note: string | null,
  actorId: string,
): Promise<InvoiceWithLines> {
  return sql.begin(async (tx) => {
    const [invoice] = await tx<Invoice[]>`select * from invoices where id = ${invoiceId}`;
    if (!invoice) throw notFound("Invoice not found");
    if (invoice.status !== "sent") {
      throw conflict(`An invoice with status ${invoice.status} cannot be marked paid`);
    }
    await tx`
      update invoices
      set status = 'paid', payment_method = ${method}, payment_note = ${note}, paid_at = now()
      where id = ${invoiceId}
    `;
    await appendAudit(
      { actorType: "user", actorId, projectId: invoice.project_id, action: "invoice.mark_paid", entityType: "invoice", entityId: invoiceId, payload: { method } },
      tx,
    );
    return loadInvoice(tx, invoiceId);
  });
}

/**
 * Voiding is how a finalized invoice is corrected. It releases the time entries
 * it locked so the work can be reissued on a fresh invoice; the void itself
 * remains on the record, and its number is never reused.
 */
export async function voidInvoice(invoiceId: string, actorId: string): Promise<InvoiceWithLines> {
  return sql.begin(async (tx) => {
    const [invoice] = await tx<Invoice[]>`select * from invoices where id = ${invoiceId}`;
    if (!invoice) throw notFound("Invoice not found");
    if (invoice.status === "draft") throw conflict("Delete the draft instead of voiding it");
    if (invoice.status === "void") throw conflict("This invoice is already void");

    await tx`select set_config('kraken.unlock_invoice', ${invoiceId}, true)`;
    const released = await tx`
      update time_entries set invoice_id = null where invoice_id = ${invoiceId}
    `;
    await tx`
      update invoices set status = 'void', voided_at = now(), published_at = null
      where id = ${invoiceId}
    `;
    await appendAudit(
      { actorType: "user", actorId, projectId: invoice.project_id, action: "invoice.void", entityType: "invoice", entityId: invoiceId, payload: { released_time_entries: released.count } },
      tx,
    );
    return loadInvoice(tx, invoiceId);
  });
}

/** Publication is a separate, reversible decision. */
export async function setInvoicePublished(
  invoiceId: string,
  published: boolean,
  actorId: string,
): Promise<InvoiceWithLines> {
  return sql.begin(async (tx) => {
    const [invoice] = await tx<Invoice[]>`select * from invoices where id = ${invoiceId}`;
    if (!invoice) throw notFound("Invoice not found");
    if (published && invoice.status !== "sent" && invoice.status !== "paid") {
      throw conflict("Only a finalized invoice can be published to the portal");
    }
    await tx`
      update invoices set published_at = ${published ? tx`now()` : null} where id = ${invoiceId}
    `;
    await appendAudit(
      {
        actorType: "user",
        actorId,
        projectId: invoice.project_id,
        action: published ? "invoice.publish" : "invoice.unpublish",
        entityType: "invoice",
        entityId: invoiceId,
        payload: {},
      },
      tx,
    );
    return loadInvoice(tx, invoiceId);
  });
}
