import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { recordDeposit } from "@/lib/data/deposits";
import { getCoveredThrough, getMaintenanceStatus } from "@/lib/data/maintenance";
import {
  addInvoiceLine,
  createDraftInvoice,
  createMaintenanceDraft,
  deleteDraftInvoice,
  finalizeInvoice,
  sweepChargesOntoDraft,
  voidInvoice,
} from "@/lib/invoices/engine";
import { createCharge, createInternalUser, createProject, resetDatabase } from "../setup/factories";

/**
 * Maintenance and build invoicing through the engine, against the real schema.
 * Money assertions are exact, to the cent.
 */

let actorId: string;

beforeEach(async () => {
  await resetDatabase();
  actorId = (await createInternalUser()).id;
});

function maintenanceProject(overrides: Parameters<typeof createProject>[0] = {}) {
  return createProject({
    billing_model: "maintenance",
    maintenance_monthly: 150,
    maintenance_starts_on: "2026-10-01",
    ...overrides,
  });
}

function lineShape(lines: { kind: string; description: string; quantity: number; unit_amount: number; amount: number }[]) {
  return lines.map(({ kind, description, quantity, unit_amount, amount }) => ({
    kind,
    description,
    quantity,
    unit_amount,
    amount,
  }));
}

describe("drafting a maintenance project by period", () => {
  it("carries charges only -- never a maintenance or retainer line", async () => {
    const project = await maintenanceProject();
    await createCharge(project.id, { kind: "fixed", description: "Logo refresh", amount: 400 });

    const draft = await createDraftInvoice({
      projectId: project.id,
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      actorId,
    });

    expect(draft.lines.map((l) => [l.kind, l.amount])).toEqual([["adhoc", 400]]);
  });

  it("puts a build charge on the invoice as a build line, still marked as a charge", async () => {
    const project = await maintenanceProject({ build_fee: 5000 });
    const charge = await createCharge(project.id, {
      kind: "build",
      description: "Website build — 50% on signing",
      amount: 2500,
      incurred_on: "2026-09-02",
    });

    const draft = await createDraftInvoice({
      projectId: project.id,
      periodStart: "2026-09-02",
      periodEnd: "2026-09-02",
      actorId,
    });

    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]).toMatchObject({
      kind: "build",
      charge_id: charge.id,
      description: "2026-09-02 — Website build — 50% on signing",
      amount: 2500,
    });
  });

  it("keeps a build charge's kind when a late sweep picks it up", async () => {
    const project = await maintenanceProject({ build_fee: 5000 });
    const draft = await createDraftInvoice({
      projectId: project.id,
      periodStart: "2026-09-02",
      periodEnd: "2026-09-02",
      actorId,
    });
    await createCharge(project.id, { kind: "build", amount: 2500 });

    const swept = await sweepChargesOntoDraft(draft.id, actorId);

    expect(swept.lines.map((l) => l.kind)).toEqual(["build"]);
  });
});

describe("createMaintenanceDraft", () => {
  it("bills a 12-month prepay to the cent: full price, discount, tax on the discounted total", async () => {
    const project = await maintenanceProject({
      maintenance_price_12: 1620,
      maintenance_term_months: 12,
      tax_rate: 0.13,
    });

    const draft = await createMaintenanceDraft(project.id, actorId);

    expect([draft.period_start, draft.period_end]).toEqual(["2026-10-01", "2027-09-30"]);
    expect(lineShape(draft.lines)).toEqual([
      { kind: "maintenance", description: "Website maintenance — Oct 2026 to Sep 2027", quantity: 12, unit_amount: 150, amount: 1800 },
      { kind: "maintenance", description: "Prepay discount — 12 months", quantity: 1, unit_amount: -180, amount: -180 },
    ]);
    expect([draft.subtotal, draft.tax_amount, draft.total]).toEqual([1620, 210.6, 1830.6]);
  });

  it("gets an uneven 6-month price right to the cent", async () => {
    const project = await maintenanceProject({
      maintenance_monthly: 149.99,
      maintenance_price_6: 849,
      maintenance_term_months: 6,
      tax_rate: 0.13,
    });

    const draft = await createMaintenanceDraft(project.id, actorId);

    expect(draft.lines.map((l) => l.amount)).toEqual([899.94, -50.94]);
    expect([draft.subtotal, draft.tax_amount, draft.total]).toEqual([849, 110.37, 959.37]);
  });

  it("bills a monthly term as one line for the month", async () => {
    const project = await maintenanceProject();
    const draft = await createMaintenanceDraft(project.id, actorId);
    expect(lineShape(draft.lines)).toEqual([
      { kind: "maintenance", description: "Website maintenance — October 2026", quantity: 1, unit_amount: 150, amount: 150 },
    ]);
  });

  it("counts an existing draft as coverage, so a second draft bills the following term", async () => {
    const project = await maintenanceProject({ maintenance_term_months: 12 });
    await createMaintenanceDraft(project.id, actorId);
    const second = await createMaintenanceDraft(project.id, actorId);
    expect([second.period_start, second.period_end]).toEqual(["2027-10-01", "2028-09-30"]);
  });

  it("uncovers a voided term, so a redraft bills the same period", async () => {
    const project = await maintenanceProject({ maintenance_term_months: 6 });
    const first = await createMaintenanceDraft(project.id, actorId);
    await finalizeInvoice(first.id, actorId);
    await voidInvoice(first.id, actorId);

    expect(await getCoveredThrough(project.id)).toBeNull();
    const redraft = await createMaintenanceDraft(project.id, actorId);
    expect([redraft.period_start, redraft.period_end]).toEqual(["2026-10-01", "2027-03-31"]);
  });

  // Review Focus 5, first half.
  it("uncovers a deleted draft term", async () => {
    const project = await maintenanceProject();
    const draft = await createMaintenanceDraft(project.id, actorId);
    await deleteDraftInvoice(draft.id, actorId);
    const redraft = await createMaintenanceDraft(project.id, actorId);
    expect(redraft.period_start).toBe("2026-10-01");
  });

  it("skips a lapse when the start month is moved past coverage", async () => {
    const project = await maintenanceProject();
    await createMaintenanceDraft(project.id, actorId);
    await sql`update projects set maintenance_starts_on = '2027-03-01' where id = ${project.id}`;
    const next = await createMaintenanceDraft(project.id, actorId);
    expect(next.period_start).toBe("2027-03-01");
  });

  // Review Focus 2.
  it("does not count a retainer invoice as maintenance coverage after a model switch", async () => {
    const project = await createProject({ billing_model: "retainer", retainer_amount: 4000 });
    await createDraftInvoice({ projectId: project.id, periodStart: "2026-09-01", periodEnd: "2026-09-30", actorId });
    await sql`
      update projects
      set billing_model = 'maintenance', maintenance_monthly = 150, maintenance_starts_on = '2026-10-01'
      where id = ${project.id}
    `;

    expect(await getCoveredThrough(project.id)).toBeNull();
    const draft = await createMaintenanceDraft(project.id, actorId);
    expect(draft.period_start).toBe("2026-10-01");
  });

  it("does not count a charges-only invoice in the same month as coverage", async () => {
    const project = await maintenanceProject({ build_fee: 5000 });
    await createCharge(project.id, { kind: "build", amount: 2500 });
    await createDraftInvoice({ projectId: project.id, periodStart: "2026-10-01", periodEnd: "2026-10-31", actorId });
    expect(await getCoveredThrough(project.id)).toBeNull();
  });

  it("claims the deposit against the full total, swept charges included", async () => {
    const project = await maintenanceProject();
    await recordDeposit(project.id, { amount: 5000, received_on: "2026-09-15", method: "etransfer", note: null });
    await createCharge(project.id, { kind: "fixed", amount: 500 });

    const draft = await createMaintenanceDraft(project.id, actorId);

    expect(draft.total).toBe(650);
    expect(draft.deposit_applied).toBe(650);
  });

  it("refuses without a start month", async () => {
    const project = await maintenanceProject({ maintenance_starts_on: null });
    await expect(createMaintenanceDraft(project.id, actorId)).rejects.toMatchObject({ code: "maintenance_not_started" });
  });

  it("refuses a project that is not build + maintenance", async () => {
    const project = await createProject({ billing_model: "hourly" });
    await expect(createMaintenanceDraft(project.id, actorId)).rejects.toMatchObject({ code: "not_maintenance" });
  });
});

describe("getMaintenanceStatus", () => {
  it("has no next term before a start month is set, and prices the term regardless", async () => {
    const project = await maintenanceProject({
      maintenance_starts_on: null,
      maintenance_term_months: 12,
      maintenance_price_12: 1620,
    });
    expect(await getMaintenanceStatus(project)).toEqual({
      covered_through: null,
      next_term: null,
      has_gap: false,
      term_price: 1620,
    });
  });

  it("reports coverage and the next term once drafted", async () => {
    const project = await maintenanceProject({ maintenance_term_months: 6 });
    await createMaintenanceDraft(project.id, actorId);
    expect(await getMaintenanceStatus(project)).toEqual({
      covered_through: "2027-03-31",
      next_term: { start: "2027-04-01", end: "2027-09-30", months: 6 },
      has_gap: false,
      term_price: 900,
    });
  });
});

describe("engine-only line kinds", () => {
  it("refuses a hand-added maintenance or build line", async () => {
    const project = await maintenanceProject();
    const draft = await createDraftInvoice({ projectId: project.id, periodStart: "2026-10-01", periodEnd: "2026-10-31", actorId });
    for (const kind of ["maintenance", "build"] as const) {
      await expect(
        addInvoiceLine(draft.id, { kind, description: "By hand", quantity: 1, unit_amount: 150 }, actorId),
      ).rejects.toMatchObject({ code: "engine_line_kind" });
    }
    const withAdhoc = await addInvoiceLine(draft.id, { kind: "adhoc", description: "Domain renewal", quantity: 1, unit_amount: 20 }, actorId);
    expect(withAdhoc.lines.map((l) => l.kind)).toEqual(["adhoc"]);
  });
});

describe("voiding a term that is not the latest", () => {
  // Final review, Important 1: coverage was max(period_end), so a voided
  // September behind a drafted October stayed "covered" and was never billed.
  it("leaves the voided month redraftable while a later month is still covered", async () => {
    const project = await maintenanceProject({ maintenance_starts_on: "2026-09-01" });
    const september = await createMaintenanceDraft(project.id, actorId);
    await finalizeInvoice(september.id, actorId);
    const october = await createMaintenanceDraft(project.id, actorId);
    expect(october.period_start).toBe("2026-10-01");

    await voidInvoice(september.id, actorId);

    const redraft = await createMaintenanceDraft(project.id, actorId);
    expect([redraft.period_start, redraft.period_end]).toEqual(["2026-09-01", "2026-09-30"]);
    const after = await createMaintenanceDraft(project.id, actorId);
    expect(after.period_start).toBe("2026-11-01");
  });

  it("never bills a hole past the coverage that follows it, even on a longer term", async () => {
    const project = await maintenanceProject({ maintenance_starts_on: "2026-09-01" });
    const september = await createMaintenanceDraft(project.id, actorId);
    await finalizeInvoice(september.id, actorId);
    await createMaintenanceDraft(project.id, actorId); // October
    await voidInvoice(september.id, actorId);
    await sql`update projects set maintenance_term_months = 12, maintenance_price_12 = 1620 where id = ${project.id}`;

    const hole = await createMaintenanceDraft(project.id, actorId);

    expect([hole.period_start, hole.period_end]).toEqual(["2026-09-01", "2026-09-30"]);
    expect(lineShape(hole.lines)).toEqual([
      { kind: "maintenance", description: "Website maintenance — September 2026", quantity: 1, unit_amount: 150, amount: 150 },
    ]);
  });

  it("reports the gap on the project's status", async () => {
    const project = await maintenanceProject({ maintenance_starts_on: "2026-09-01" });
    const september = await createMaintenanceDraft(project.id, actorId);
    await finalizeInvoice(september.id, actorId);
    await createMaintenanceDraft(project.id, actorId);
    await voidInvoice(september.id, actorId);

    expect(await getMaintenanceStatus(project)).toMatchObject({
      covered_through: "2026-10-31",
      next_term: { start: "2026-09-01", end: "2026-09-30", months: 1 },
      has_gap: true,
    });
  });
});
