import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { getRetainerRunPreview } from "@/lib/data/dashboard";
import { listRenewalsDue, maintenanceRunCandidates } from "@/lib/data/maintenance";
import { startOfMonth, today } from "@/lib/format";
import { createDraftInvoice, createMaintenanceDraft } from "@/lib/invoices/engine";
import { createCharge, createInternalUser, createProject, resetDatabase } from "../setup/factories";

let actorId: string;

beforeEach(async () => {
  await resetDatabase();
  actorId = (await createInternalUser()).id;
});

function monthly(overrides: Parameters<typeof createProject>[0] = {}) {
  return createProject({
    billing_model: "maintenance",
    maintenance_monthly: 150,
    maintenance_term_months: 1,
    maintenance_starts_on: "2026-09-01",
    ...overrides,
  });
}

/** A sent maintenance invoice covering exactly [start, end]. */
async function coverThrough(projectId: string, start: string, end: string): Promise<void> {
  const [invoice] = await sql<{ id: string }[]>`
    insert into invoices (project_id, status, period_start, period_end, currency)
    values (${projectId}, 'draft', ${start}, ${end}, 'USD')
    returning id
  `;
  if (!invoice) throw new Error("coverThrough: insert returned no row");
  await sql`
    insert into invoice_lines (invoice_id, kind, description, quantity, unit_amount, amount)
    values (${invoice.id}, 'maintenance', 'Website maintenance', 1, 150, 150)
  `;
  await sql`
    update invoices set status = 'sent', number = ${`T-${randomUUID().slice(0, 8)}`}
    where id = ${invoice.id}
  `;
}

describe("maintenanceRunCandidates", () => {
  it("finds an uncovered monthly project, and not once its month is drafted", async () => {
    const project = await monthly({ maintenance_starts_on: "2026-10-01" });
    expect((await maintenanceRunCandidates("2026-10-01")).due.map((r) => r.id)).toEqual([project.id]);

    await createMaintenanceDraft(project.id, actorId);
    expect(await maintenanceRunCandidates("2026-10-01")).toEqual({ due: [], current: 1 });
  });

  it("never includes a prepaid project", async () => {
    await monthly({ maintenance_term_months: 12, maintenance_starts_on: "2026-10-01" });
    expect(await maintenanceRunCandidates("2026-10-01")).toEqual({ due: [], current: 0 });
  });

  it("is not fooled by a build-installment invoice in the same month", async () => {
    const project = await monthly({ maintenance_starts_on: "2026-10-01", build_fee: 5000 });
    await createCharge(project.id, { kind: "build", amount: 2500 });
    await createDraftInvoice({ projectId: project.id, periodStart: "2026-10-01", periodEnd: "2026-10-31", actorId });
    expect((await maintenanceRunCandidates("2026-10-01")).due.map((r) => r.id)).toEqual([project.id]);
  });

  it("ignores a project that starts next month", async () => {
    await monthly({ maintenance_starts_on: "2026-11-01" });
    expect(await maintenanceRunCandidates("2026-10-01")).toEqual({ due: [], current: 0 });
  });

  it("catches up one month per run, without skipping any", async () => {
    const project = await monthly({ maintenance_starts_on: "2026-06-01" });
    await coverThrough(project.id, "2026-06-01", "2026-08-31");

    expect((await maintenanceRunCandidates("2026-10-01")).due).toHaveLength(1);
    expect((await createMaintenanceDraft(project.id, actorId)).period_start).toBe("2026-09-01");
    expect((await maintenanceRunCandidates("2026-10-01")).due).toHaveLength(1);
    expect((await createMaintenanceDraft(project.id, actorId)).period_start).toBe("2026-10-01");
    expect((await maintenanceRunCandidates("2026-10-01")).due).toHaveLength(0);
  });

  // Review Focus 4.
  it("leaves a prepaid client switched to monthly alone until coverage ends", async () => {
    const project = await monthly({ maintenance_term_months: 12, maintenance_starts_on: "2026-10-01" });
    await coverThrough(project.id, "2026-10-01", "2027-09-30");
    await sql`update projects set maintenance_term_months = 1 where id = ${project.id}`;

    expect((await maintenanceRunCandidates("2026-11-01")).due).toHaveLength(0);
    expect((await maintenanceRunCandidates("2027-10-01")).due.map((r) => r.id)).toEqual([project.id]);
  });

  // Review Focus 5, second half.
  it("drops a paused project from the run", async () => {
    await monthly({ maintenance_starts_on: "2026-10-01", status: "paused" });
    expect(await maintenanceRunCandidates("2026-10-01")).toEqual({ due: [], current: 0 });
  });
});

describe("listRenewalsDue", () => {
  it("includes coverage ending in 30 days and excludes 31", async () => {
    const project = await monthly({ maintenance_term_months: 12, maintenance_starts_on: "2025-10-01" });
    await coverThrough(project.id, "2025-10-01", "2026-09-30");

    expect((await listRenewalsDue("2026-08-31")).map((r) => r.id)).toEqual([project.id]);
    expect(await listRenewalsDue("2026-08-30")).toEqual([]);
  });

  it("includes lapsed coverage and a start month with nothing invoiced", async () => {
    const lapsed = await monthly({ maintenance_term_months: 6, maintenance_starts_on: "2026-01-01", name: "A lapsed" });
    await coverThrough(lapsed.id, "2026-01-01", "2026-06-30");
    const fresh = await monthly({ maintenance_term_months: 12, maintenance_starts_on: "2026-09-01", name: "B fresh" });
    await monthly({ maintenance_term_months: 12, maintenance_starts_on: "2026-11-01", name: "C later" });

    const due = await listRenewalsDue("2026-08-31");
    expect(due.map((r) => r.id).sort()).toEqual([lapsed.id, fresh.id].sort());
    const freshRow = due.find((r) => r.id === fresh.id);
    expect(freshRow).toMatchObject({ covered_through: null, next_start: "2026-09-01", term_months: 12 });
  });

  it("excludes monthly-term and paused projects", async () => {
    await monthly({ maintenance_starts_on: "2026-09-01" });
    await monthly({ maintenance_term_months: 12, maintenance_starts_on: "2026-09-01", status: "paused" });
    expect(await listRenewalsDue("2026-08-31")).toEqual([]);
  });
});

describe("getRetainerRunPreview", () => {
  it("counts a due monthly maintenance project, then counts it as invoiced", async () => {
    const project = await monthly({ maintenance_starts_on: startOfMonth(today()) });
    expect(await getRetainerRunPreview()).toMatchObject({ eligible: 1, already_invoiced: 0 });
    await createMaintenanceDraft(project.id, actorId);
    expect(await getRetainerRunPreview()).toMatchObject({ eligible: 0, already_invoiced: 1 });
  });
});

describe("a voided month behind a later one", () => {
  it("is due in the monthly run, so it cannot go unbilled", async () => {
    const project = await monthly({ maintenance_starts_on: "2026-09-01" });
    const september = await createMaintenanceDraft(project.id, actorId);
    await createMaintenanceDraft(project.id, actorId); // October
    await sql`delete from invoices where id = ${september.id}`;

    expect((await maintenanceRunCandidates("2026-10-01")).due.map((r) => r.id)).toEqual([project.id]);
    expect((await createMaintenanceDraft(project.id, actorId)).period_start).toBe("2026-09-01");
  });

  it("is due in Renewals due for a prepaid client", async () => {
    const project = await monthly({ maintenance_term_months: 6, maintenance_starts_on: "2026-01-01" });
    await coverThrough(project.id, "2026-07-01", "2026-12-31");
    expect((await listRenewalsDue("2026-09-28")).map((r) => [r.id, r.next_start])).toEqual([[project.id, "2026-01-01"]]);
  });
});
