import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { getDepositBalance, listProjectDeposits, recordDeposit } from "@/lib/data/deposits";
import { createProject, resetDatabase } from "../setup/factories";

beforeEach(resetDatabase);

describe("project_deposits", () => {
  it("records a deposit against a project", async () => {
    const project = await createProject();
    await sql`insert into project_deposits (project_id, amount, received_on, method)
              values (${project.id}, 2500, ${"2026-05-20"}, ${"etransfer"})`;
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from project_deposits where project_id = ${project.id}`;
    expect(rows[0]?.n).toBe(1);
  });

  it("refuses a zero or negative deposit", async () => {
    const project = await createProject();
    await expect(
      sql`insert into project_deposits (project_id, amount, received_on, method)
          values (${project.id}, 0, ${"2026-05-20"}, ${"cash"})`,
    ).rejects.toThrow();
    await expect(
      sql`insert into project_deposits (project_id, amount, received_on, method)
          values (${project.id}, -50, ${"2026-05-20"}, ${"cash"})`,
    ).rejects.toThrow();
  });

  it("removes deposits when the project is deleted", async () => {
    const project = await createProject();
    await sql`insert into project_deposits (project_id, amount, received_on, method)
              values (${project.id}, 100, ${"2026-05-20"}, ${"cash"})`;
    await sql`delete from projects where id = ${project.id}`;
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from project_deposits where project_id = ${project.id}`;
    expect(rows[0]?.n).toBe(0);
  });

  it("has row level security enabled", async () => {
    const rows = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class
      where relname = 'project_deposits' and relnamespace = 'public'::regnamespace`;
    expect(rows[0]?.relrowsecurity).toBe(true);
  });

  it("defaults deposit_applied to zero on every existing invoice", async () => {
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from invoices where deposit_applied is null`;
    expect(rows[0]?.n).toBe(0);
  });

  it("refuses a negative deposit_applied", async () => {
    const project = await createProject();
    await expect(
      sql`insert into invoices (project_id, status, period_start, period_end, currency, deposit_applied)
          values (${project.id}, 'draft', ${"2026-03-01"}, ${"2026-03-31"}, 'USD', -1)`,
    ).rejects.toThrow();
  });

  it("refuses to change deposit_applied on a finalized invoice", async () => {
    const project = await createProject();
    const [invoice] = await sql<{ id: string }[]>`
      insert into invoices (project_id, number, status, period_start, period_end,
                            currency, subtotal, tax_amount, total, deposit_applied,
                            finalized_at, sent_at)
      values (${project.id}, ${"2026-901"}, 'sent', ${"2026-03-01"}, ${"2026-03-31"},
              'USD', 1000, 0, 1000, 250, now(), now())
      returning id
    `;
    await expect(
      sql`update invoices set deposit_applied = 500 where id = ${invoice.id}`,
    ).rejects.toThrow(/invoice_immutable/);
  });

  it("still lets pdf_path be written once on a finalized invoice", async () => {
    const project = await createProject();
    const [invoice] = await sql<{ id: string }[]>`
      insert into invoices (project_id, number, status, period_start, period_end,
                            currency, subtotal, tax_amount, total, finalized_at, sent_at)
      values (${project.id}, ${"2026-902"}, 'sent', ${"2026-03-01"}, ${"2026-03-31"},
              'USD', 1000, 0, 1000, now(), now())
      returning id
    `;
    await sql`update invoices set pdf_path = ${"a/b.pdf"} where id = ${invoice.id}`;
    await expect(
      sql`update invoices set pdf_path = ${"c/d.pdf"} where id = ${invoice.id}`,
    ).rejects.toThrow(/invoice_immutable/);
  });
});

describe("the derived deposit balance", () => {
  it("is zero for a project with no deposits", async () => {
    const project = await createProject();
    expect(await getDepositBalance(project.id)).toEqual({ received: 0, applied: 0, remaining: 0 });
  });

  it("sums what was received", async () => {
    const project = await createProject();
    await recordDeposit(project.id, { amount: 2500, received_on: "2026-05-20", method: "etransfer", note: null });
    await recordDeposit(project.id, { amount: 500, received_on: "2026-07-01", method: "cash", note: null });
    const balance = await getDepositBalance(project.id);
    expect(balance.received).toBe(3000);
    expect(balance.remaining).toBe(3000);
  });

  it("subtracts what invoices have drawn down", async () => {
    const project = await createProject();
    await recordDeposit(project.id, { amount: 2500, received_on: "2026-05-20", method: "etransfer", note: null });
    await sql`
      insert into invoices (project_id, number, status, period_start, period_end,
                            currency, subtotal, tax_amount, total, deposit_applied,
                            finalized_at, sent_at)
      values (${project.id}, ${"2026-910"}, 'sent', ${"2026-03-01"}, ${"2026-03-31"},
              'USD', 5000, 0, 5000, 1200, now(), now())
    `;
    const balance = await getDepositBalance(project.id);
    expect(balance.applied).toBe(1200);
    expect(balance.remaining).toBe(1300);
  });

  it("returns a voided invoice's deposit to the balance", async () => {
    const project = await createProject();
    await recordDeposit(project.id, { amount: 2500, received_on: "2026-05-20", method: "etransfer", note: null });
    const [invoice] = await sql<{ id: string }[]>`
      insert into invoices (project_id, number, status, period_start, period_end,
                            currency, subtotal, tax_amount, total, deposit_applied,
                            finalized_at, sent_at)
      values (${project.id}, ${"2026-911"}, 'sent', ${"2026-03-01"}, ${"2026-03-31"},
              'USD', 5000, 0, 5000, 2500, now(), now())
      returning id
    `;
    expect((await getDepositBalance(project.id)).remaining).toBe(0);

    await sql`update invoices set status = 'void', voided_at = now() where id = ${invoice.id}`;
    expect((await getDepositBalance(project.id)).remaining).toBe(2500);
  });

  it("lists deposits newest received first", async () => {
    const project = await createProject();
    await recordDeposit(project.id, { amount: 100, received_on: "2026-05-01", method: "cash", note: null });
    await recordDeposit(project.id, { amount: 200, received_on: "2026-07-01", method: "cash", note: null });
    const deposits = await listProjectDeposits(project.id);
    expect(deposits.map((d) => d.amount)).toEqual([200, 100]);
  });
});
