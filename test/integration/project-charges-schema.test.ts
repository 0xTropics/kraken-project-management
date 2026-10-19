import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { createProject, resetDatabase } from "../setup/factories";

beforeEach(resetDatabase);

async function makeInvoice(projectId: string, status = "draft"): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into invoices (project_id, status, period_start, period_end, currency)
    values (${projectId}, ${status}, ${"2026-03-01"}, ${"2026-03-31"}, 'USD')
    returning id
  `;
  if (!row) throw new Error("makeInvoice: insert returned no row");
  return row.id;
}

async function makeCharge(projectId: string, amount = 38.4): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into project_charges (project_id, kind, description, amount, incurred_on)
    values (${projectId}, 'expense', ${"Shipping and packaging"}, ${amount}, ${"2026-03-15"})
    returning id
  `;
  if (!row) throw new Error("makeCharge: insert returned no row");
  return row.id;
}

async function addLine(invoiceId: string, chargeId: string | null): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into invoice_lines (invoice_id, kind, description, quantity, unit_amount, amount, charge_id)
    values (${invoiceId}, 'adhoc', ${"Shipping"}, 1, 38.4, 38.4, ${chargeId})
    returning id
  `;
  if (!row) throw new Error("addLine: insert returned no row");
  return row.id;
}

describe("project_charges schema", () => {
  it("records a charge against a project", async () => {
    const project = await createProject();
    await makeCharge(project.id);
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from project_charges where project_id = ${project.id}`;
    expect(rows[0]?.n).toBe(1);
  });

  it("refuses a zero or negative amount", async () => {
    const project = await createProject();
    await expect(makeCharge(project.id, 0)).rejects.toThrow(/project_charges_amount_check/);
    await expect(makeCharge(project.id, -50)).rejects.toThrow(/project_charges_amount_check/);
  });

  it("defaults taxable to true", async () => {
    const project = await createProject();
    const id = await makeCharge(project.id);
    const rows = await sql<{ taxable: boolean }[]>`
      select taxable from project_charges where id = ${id}`;
    expect(rows[0]?.taxable).toBe(true);
  });

  it("removes charges when the project is deleted", async () => {
    const project = await createProject();
    await makeCharge(project.id);
    await sql`delete from projects where id = ${project.id}`;
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from project_charges where project_id = ${project.id}`;
    expect(rows[0]?.n).toBe(0);
  });

  it("has row level security enabled", async () => {
    const rows = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class
      where relname = 'project_charges' and relnamespace = 'public'::regnamespace`;
    expect(rows[0]?.relrowsecurity).toBe(true);
  });

  it("defaults invoice_lines.taxable to true when the column is omitted", async () => {
    const project = await createProject();
    const invoice = await makeInvoice(project.id);
    const [row] = await sql<{ taxable: boolean }[]>`
      insert into invoice_lines (invoice_id, kind, description, quantity, unit_amount, amount)
      values (${invoice}, 'adhoc', ${"Shipping"}, 1, 38.4, 38.4)
      returning taxable
    `;
    if (!row) throw new Error("insert returned no row");
    expect(row.taxable).toBe(true);
  });

  it("refuses a second line for the same charge on a live invoice", async () => {
    const project = await createProject();
    const charge = await makeCharge(project.id);
    const first = await makeInvoice(project.id);
    await addLine(first, charge);
    const second = await makeInvoice(project.id);
    await expect(addLine(second, charge)).rejects.toThrow(/charge_already_billed/);
  });

  it("allows rebilling a charge after its invoice is voided", async () => {
    const project = await createProject();
    const charge = await makeCharge(project.id);
    const first = await makeInvoice(project.id);
    await addLine(first, charge);
    // invoices_number_presence requires a number on any non-draft invoice, so
    // the void update carries one here -- production never voids a still-draft
    // invoice (src/lib/invoices/engine.ts), but this test drives the status
    // column directly to isolate the charge-release behaviour.
    await sql`
      update invoices set status = 'void', voided_at = now(), number = ${"2026-901"}
      where id = ${first}`;
    const second = await makeInvoice(project.id);
    await expect(addLine(second, charge)).resolves.toBeTypeOf("string");
  });

  it("allows many lines with no charge_id", async () => {
    const project = await createProject();
    const invoice = await makeInvoice(project.id);
    await addLine(invoice, null);
    await expect(addLine(invoice, null)).resolves.toBeTypeOf("string");
  });

  it("refuses to delete a charge that is on an invoice", async () => {
    const project = await createProject();
    const charge = await makeCharge(project.id);
    const invoice = await makeInvoice(project.id);
    await addLine(invoice, charge);
    await expect(
      sql`delete from project_charges where id = ${charge}`,
    ).rejects.toThrow(/invoice_lines_charge_id_fkey/);
  });
});
