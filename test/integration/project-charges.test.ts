import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import {
  deleteCharge,
  listProjectCharges,
  listUnbilledCharges,
  recordCharge,
} from "@/lib/data/charges";
import { createDraftInvoice, finalizeInvoice, removeInvoiceLine, voidInvoice } from "@/lib/invoices/engine";
import {
  createCharge,
  createInternalUser,
  createProject,
  createTimeEntry,
  resetDatabase,
} from "../setup/factories";

beforeEach(resetDatabase);

// invoice_lines_parent_draft only allows inserting a line while the parent
// invoice is still a draft, and invoices_number_presence requires
// (status = 'draft') = (number is null). So every invoice here is created as
// a numberless draft, the line is added, and only then -- if a later status
// is wanted -- a separate update carries it forward with a number. Mirrors
// the pattern in test/integration/project-charges-schema.test.ts.
async function billCharge(
  projectId: string,
  chargeId: string,
  status = "sent",
  number = "2026-050",
): Promise<string> {
  const [invoice] = await sql<{ id: string }[]>`
    insert into invoices (project_id, status, period_start, period_end, currency)
    values (${projectId}, 'draft', ${"2026-03-01"}, ${"2026-03-31"}, 'USD')
    returning id
  `;
  if (!invoice) throw new Error("billCharge: insert returned no row");
  await sql`
    insert into invoice_lines (invoice_id, kind, description, quantity, unit_amount, amount, charge_id)
    values (${invoice.id}, 'adhoc', ${"Shipping"}, 1, 38.4, 38.4, ${chargeId})
  `;
  if (status !== "draft") {
    await sql`update invoices set status = ${status}, number = ${number} where id = ${invoice.id}`;
  }
  return invoice.id;
}

describe("charges data layer", () => {
  it("records a charge and reads it back", async () => {
    const project = await createProject();
    const charge = await recordCharge(project.id, {
      kind: "commission",
      description: "5% referral fee on a CA$12,000 contract",
      amount: 600,
      taxable: true,
      incurred_on: "2026-04-02",
      note: null,
    });
    expect(charge.amount).toBe(600);
    expect(charge.kind).toBe("commission");
    expect(charge.incurred_on).toBe("2026-04-02");
  });

  it("lists an unbilled charge", async () => {
    const project = await createProject();
    await createCharge(project.id);
    const unbilled = await listUnbilledCharges(project.id);
    expect(unbilled).toHaveLength(1);
  });

  it("excludes a charge already on a live invoice", async () => {
    const project = await createProject();
    const charge = await createCharge(project.id);
    await billCharge(project.id, charge.id);
    expect(await listUnbilledCharges(project.id)).toHaveLength(0);
  });

  it("returns a charge to unbilled when its invoice is voided", async () => {
    const project = await createProject();
    const charge = await createCharge(project.id);
    const invoice = await billCharge(project.id, charge.id, "sent");
    await sql`update invoices set status = 'void', voided_at = now() where id = ${invoice}`;
    expect(await listUnbilledCharges(project.id)).toHaveLength(1);
  });

  it("returns a charge to unbilled when its draft is deleted", async () => {
    const project = await createProject();
    const charge = await createCharge(project.id);
    const invoice = await billCharge(project.id, charge.id, "draft");
    await sql`delete from invoices where id = ${invoice}`;
    expect(await listUnbilledCharges(project.id)).toHaveLength(1);
  });

  it("reports the billing state and invoice number in the full list", async () => {
    const project = await createProject();
    const billed = await createCharge(project.id, { description: "Billed one" });
    await createCharge(project.id, { description: "Unbilled one" });
    await billCharge(project.id, billed.id);

    const all = await listProjectCharges(project.id);
    expect(all).toHaveLength(2);
    const billedRow = all.find((c) => c.description === "Billed one");
    const unbilledRow = all.find((c) => c.description === "Unbilled one");
    expect(billedRow?.invoice_number).toBe("2026-050");
    expect(unbilledRow?.invoice_id).toBeNull();
    expect(unbilledRow?.invoice_number).toBeNull();
  });

  it("deletes an unbilled charge", async () => {
    const project = await createProject();
    const charge = await createCharge(project.id);
    expect(await deleteCharge(charge.id)).toBe(true);
    expect(await listUnbilledCharges(project.id)).toHaveLength(0);
  });

  it("refuses to delete a charge that is on an invoice", async () => {
    const project = await createProject();
    const charge = await createCharge(project.id);
    await billCharge(project.id, charge.id);
    await expect(deleteCharge(charge.id)).rejects.toThrow(/invoice_lines_charge_id_fkey/);
  });

  it("refuses to delete a charge whose only invoice is void", async () => {
    // Finding 1: `on delete restrict` counts every referencing line, void or
    // not, but listUnbilledCharges/listProjectCharges only count live ones.
    // A charge here is unbilled by the derived definition (it will re-sweep
    // onto the next draft) yet still permanently blocked from deletion by the
    // FK -- this is the gap the DELETE route's pre-check has to match.
    const project = await createProject();
    const charge = await createCharge(project.id);
    const voided = await billCharge(project.id, charge.id, "sent");
    await sql`update invoices set status = 'void', voided_at = now() where id = ${voided}`;

    expect(await listUnbilledCharges(project.id)).toHaveLength(1);
    await expect(deleteCharge(charge.id)).rejects.toThrow(/invoice_lines_charge_id_fkey/);
  });

  it("returns exactly one row for a void-and-reissue charge, carrying the live invoice", async () => {
    const project = await createProject();
    const charge = await createCharge(project.id);
    const invoiceA = await billCharge(project.id, charge.id, "sent", "2026-050");
    await sql`update invoices set status = 'void', voided_at = now() where id = ${invoiceA}`;
    await billCharge(project.id, charge.id, "sent", "2026-051");

    const all = await listProjectCharges(project.id);
    const rows = all.filter((c) => c.id === charge.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.invoice_number).toBe("2026-051");
  });
});

describe("charges on a draft invoice", () => {
  it("sweeps a charge dated outside the invoice period", async () => {
    // A pass-through cost can arise while the hours are being logged, months
    // before the invoice that should carry it. A period-scoped sweep would
    // strand it, which is the failure this feature exists to fix.
    const user = await createInternalUser();
    const project = await createProject({ billing_model: "hourly", hourly_rate: 120 });
    await createCharge(project.id, { incurred_on: "2026-01-05", amount: 38.4 });

    const draft = await createDraftInvoice({
      projectId: project.id,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      actorId: user.id,
    });

    const chargeLine = draft.lines.find((l) => l.charge_id !== null);
    expect(chargeLine).toBeDefined();
    expect(chargeLine?.amount).toBe(38.4);
    expect(chargeLine?.description).toContain("2026-01-05");
  });

  it("does not sweep a charge already on a live invoice", async () => {
    const user = await createInternalUser();
    const project = await createProject({ billing_model: "hourly", hourly_rate: 120 });
    await createCharge(project.id);

    const first = await createDraftInvoice({
      projectId: project.id, periodStart: "2026-08-01", periodEnd: "2026-08-31", actorId: user.id,
    });
    expect(first.lines.filter((l) => l.charge_id !== null)).toHaveLength(1);

    const second = await createDraftInvoice({
      projectId: project.id, periodStart: "2026-09-01", periodEnd: "2026-09-30", actorId: user.id,
    });
    expect(second.lines.filter((l) => l.charge_id !== null)).toHaveLength(0);
  });

  it("returns a charge to unbilled when its line is removed", async () => {
    const user = await createInternalUser();
    const project = await createProject({ billing_model: "hourly", hourly_rate: 120 });
    await createCharge(project.id);
    const draft = await createDraftInvoice({
      projectId: project.id, periodStart: "2026-08-01", periodEnd: "2026-08-31", actorId: user.id,
    });
    const line = draft.lines.find((l) => l.charge_id !== null);
    if (!line) throw new Error("expected a charge line");

    await removeInvoiceLine(draft.id, line.id, user.id);
    expect(await listUnbilledCharges(project.id)).toHaveLength(1);
  });

  it("returns a charge to unbilled when the invoice is voided, and rebills it", async () => {
    const user = await createInternalUser();
    const project = await createProject({ billing_model: "hourly", hourly_rate: 120 });
    await createTimeEntry(project.id, { date: "2026-08-04", hours_worked: 1, hours_billed: 1 });
    await createCharge(project.id);

    const draft = await createDraftInvoice({
      projectId: project.id, periodStart: "2026-08-01", periodEnd: "2026-08-31", actorId: user.id,
    });
    await finalizeInvoice(draft.id, user.id);
    expect(await listUnbilledCharges(project.id)).toHaveLength(0);

    await voidInvoice(draft.id, user.id);
    expect(await listUnbilledCharges(project.id)).toHaveLength(1);

    const reissued = await createDraftInvoice({
      projectId: project.id, periodStart: "2026-08-01", periodEnd: "2026-08-31", actorId: user.id,
    });
    expect(reissued.lines.filter((l) => l.charge_id !== null)).toHaveLength(1);
  });

  it("keeps a non-taxable charge out of the taxable base", async () => {
    const user = await createInternalUser();
    const project = await createProject({
      billing_model: "hourly", hourly_rate: 120, tax_rate: 0.13,
    });
    // time_entries.hours_worked/hours_billed are capped at 24 each (check
    // constraint), so 62.5 hours is logged as five entries rather than one.
    for (let i = 0; i < 5; i += 1) {
      await createTimeEntry(project.id, {
        date: "2026-08-04", hours_worked: 12.5, hours_billed: 12.5,
      });
    }
    await createCharge(project.id, { amount: 750, taxable: true, description: "Landing page" });
    await createCharge(project.id, { amount: 38.4, taxable: false, description: "Shipping" });

    const draft = await createDraftInvoice({
      projectId: project.id, periodStart: "2026-08-01", periodEnd: "2026-08-31", actorId: user.id,
    });

    expect(draft.subtotal).toBe(8288.4);
    expect(draft.tax_amount).toBe(1072.5);
    expect(draft.total).toBe(9360.9);
  });

  it("auto-claims a deposit against a total that includes charges", async () => {
    // The ordering trap: the deposit claim reads `total` after
    // recomputeAndStore. If charges landed after that read, the claim would be
    // computed against a total missing them.
    const user = await createInternalUser();
    const project = await createProject({ billing_model: "hourly", hourly_rate: 120 });
    await createCharge(project.id, { amount: 500, taxable: true });
    await sql`insert into project_deposits (project_id, amount, received_on, method)
              values (${project.id}, 400, ${"2026-07-01"}, 'etransfer')`;

    const draft = await createDraftInvoice({
      projectId: project.id, periodStart: "2026-08-01", periodEnd: "2026-08-31", actorId: user.id,
    });
    expect(draft.total).toBe(500);
    expect(draft.deposit_applied).toBe(400);
  });
});
