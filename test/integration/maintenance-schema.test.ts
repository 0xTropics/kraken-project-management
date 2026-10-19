import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { createCharge, createProject, resetDatabase } from "../setup/factories";

/**
 * The build + maintenance columns and their check constraints, exercised with
 * raw SQL so a pass cannot come from the API refusing first. Every rejection
 * is asserted on the constraint's own name: a test that passes on any error
 * proves nothing.
 */

beforeEach(resetDatabase);

describe("build + maintenance columns", () => {
  it("accepts a maintenance project with every option set", async () => {
    const project = await createProject({
      billing_model: "maintenance",
      build_fee: 5000,
      maintenance_monthly: 150,
      maintenance_price_6: 840,
      maintenance_price_12: 1620,
      maintenance_term_months: 12,
      maintenance_starts_on: "2026-10-01",
    });
    expect(project.billing_model).toBe("maintenance");
    expect(project.build_fee).toBe(5000);
    expect(project.maintenance_price_12).toBe(1620);
    expect(project.maintenance_term_months).toBe(12);
    expect(project.maintenance_starts_on).toBe("2026-10-01");
  });

  it("leaves hourly and retainer projects on the defaults", async () => {
    const project = await createProject({ billing_model: "retainer" });
    expect(project.maintenance_term_months).toBe(1);
    expect(project.maintenance_monthly).toBeNull();
    expect(project.build_fee).toBeNull();
    expect(project.maintenance_starts_on).toBeNull();
  });

  it("refuses a maintenance project with no monthly price", async () => {
    const project = await createProject({ billing_model: "maintenance" });
    await expect(
      sql`update projects set maintenance_monthly = null where id = ${project.id}`,
    ).rejects.toThrow(/projects_maintenance_needs_monthly/);
  });

  it("refuses a prepay price above paying monthly, and accepts one equal to it", async () => {
    const project = await createProject({ billing_model: "maintenance", maintenance_monthly: 150 });
    await expect(
      sql`update projects set maintenance_price_6 = 900.01 where id = ${project.id}`,
    ).rejects.toThrow(/projects_maintenance_price_6_range/);
    await expect(
      sql`update projects set maintenance_price_12 = 1800.01 where id = ${project.id}`,
    ).rejects.toThrow(/projects_maintenance_price_12_range/);
    await sql`
      update projects set maintenance_price_6 = 900, maintenance_price_12 = 1800
      where id = ${project.id}
    `;
  });

  it("refuses a prepay price with no monthly price behind it", async () => {
    const project = await createProject({ billing_model: "hourly" });
    await expect(
      sql`update projects set maintenance_price_12 = 1000 where id = ${project.id}`,
    ).rejects.toThrow(/projects_maintenance_price_12_range/);
  });

  it("refuses a term other than 1, 6 or 12", async () => {
    const project = await createProject({ billing_model: "maintenance" });
    await expect(
      sql`update projects set maintenance_term_months = 3 where id = ${project.id}`,
    ).rejects.toThrow(/projects_maintenance_term_months_check/);
  });

  it("refuses a start date that is not the 1st of a month", async () => {
    const project = await createProject({ billing_model: "maintenance" });
    await expect(
      sql`update projects set maintenance_starts_on = '2026-10-15' where id = ${project.id}`,
    ).rejects.toThrow(/projects_maintenance_starts_on_check/);
  });

  it("refuses a zero build fee", async () => {
    const project = await createProject({ billing_model: "maintenance" });
    await expect(
      sql`update projects set build_fee = 0 where id = ${project.id}`,
    ).rejects.toThrow(/projects_build_fee_check/);
  });

  it("accepts the maintenance and build line kinds and the build charge kind", async () => {
    const project = await createProject({ billing_model: "maintenance" });
    const charge = await createCharge(project.id, { kind: "build", amount: 2500 });
    expect(charge.kind).toBe("build");

    const [invoice] = await sql<{ id: string }[]>`
      insert into invoices (project_id, status, period_start, period_end, currency)
      values (${project.id}, 'draft', '2026-10-01', '2026-10-31', 'USD')
      returning id
    `;
    if (!invoice) throw new Error("insert returned no row");
    await sql`
      insert into invoice_lines (invoice_id, kind, description, quantity, unit_amount, amount)
      values (${invoice.id}, 'maintenance', 'Website maintenance — October 2026', 1, 150, 150),
             (${invoice.id}, 'build', 'Build', 1, 2500, 2500)
    `;
    const rows = await sql<{ kind: string }[]>`
      select kind from invoice_lines where invoice_id = ${invoice.id}
    `;
    expect(rows.map((row) => row.kind).sort()).toEqual(["build", "maintenance"]);
  });
});
