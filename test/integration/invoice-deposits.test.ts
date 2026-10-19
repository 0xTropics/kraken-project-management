import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import {
  createInternalUser,
  createProject,
  createTimeEntry,
  resetDatabase,
} from "../setup/factories";
import { recordDeposit, getDepositBalance } from "@/lib/data/deposits";
import { addInvoiceLine, createDraftInvoice, finalizeInvoice, removeInvoiceLine } from "@/lib/invoices/engine";

let actorId: string;
beforeEach(async () => {
  await resetDatabase();
  actorId = (await createInternalUser()).id;
});

async function projectWithHours(hours: number, rate: number, taxRate = 0) {
  const project = await createProject({
    billing_model: "hourly", hourly_rate: rate, tax_rate: taxRate,
  });
  await createTimeEntry(project.id, { hours_worked: hours, hours_billed: hours, date: "2026-03-10" });
  return project;
}

async function draft(projectId: string) {
  return createDraftInvoice({
    projectId, periodStart: "2026-03-01", periodEnd: "2026-03-31", actorId,
  });
}

describe("deposits on an invoice", () => {
  it("does not reduce the tax", async () => {
    // 10h @ 100 = 1000, tax 13% = 130, total 1130. A 300 deposit leaves 830 due
    // and the tax untouched. Were the deposit a line, subtotal would be 700 and
    // the tax 91 -- under-collecting 39.
    const project = await projectWithHours(10, 100, 0.13);
    await recordDeposit(project.id, { amount: 300, received_on: "2026-02-01", method: "cash", note: null });
    const created = await draft(project.id);

    const [row] = await sql<{ subtotal: number; tax_amount: number; total: number; deposit_applied: number }[]>`
      select subtotal, tax_amount, total, deposit_applied from invoices where id = ${created.id}`;
    expect(Number(row?.subtotal)).toBe(1000);
    expect(Number(row?.tax_amount)).toBe(130);
    expect(Number(row?.total)).toBe(1130);
    expect(Number(row?.deposit_applied)).toBe(300);
  });

  it("applies no more than the invoice is worth", async () => {
    const project = await projectWithHours(1, 100);
    await recordDeposit(project.id, { amount: 5000, received_on: "2026-02-01", method: "cash", note: null });
    const created = await draft(project.id);
    const [row] = await sql<{ total: number; deposit_applied: number }[]>`
      select total, deposit_applied from invoices where id = ${created.id}`;
    expect(Number(row?.deposit_applied)).toBe(Number(row?.total));
    expect((await getDepositBalance(project.id)).remaining).toBe(5000 - Number(row?.total));
  });

  it("applies nothing when the project holds no deposit", async () => {
    const project = await projectWithHours(5, 100);
    const created = await draft(project.id);
    const [row] = await sql<{ deposit_applied: number }[]>`
      select deposit_applied from invoices where id = ${created.id}`;
    expect(Number(row?.deposit_applied)).toBe(0);
  });

  it("refuses to finalize when the balance has since been consumed", async () => {
    const project = await projectWithHours(10, 100);
    await recordDeposit(project.id, { amount: 400, received_on: "2026-02-01", method: "cash", note: null });
    const first = await draft(project.id);

    // A second invoice consumes the balance behind the first draft's back.
    await sql`
      insert into invoices (project_id, number, status, period_start, period_end,
                            currency, subtotal, tax_amount, total, deposit_applied,
                            finalized_at, sent_at)
      values (${project.id}, ${"2026-920"}, 'sent', ${"2026-01-01"}, ${"2026-01-31"},
              'USD', 900, 0, 900, 400, now(), now())
    `;

    await expect(finalizeInvoice(first.id, actorId)).rejects.toMatchObject({ code: "deposit_unavailable" });
  });

  it("finalizes successfully and keeps deposit_applied when the balance is untouched", async () => {
    // A positive control for the self-exclusion in the finalize balance check:
    // the invoice's own deposit_applied must not be counted against itself.
    // Deleting `and id <> ${invoiceId}` from that query makes this test fail
    // (see the fix report for confirmation).
    const project = await projectWithHours(10, 100);
    await recordDeposit(project.id, { amount: 300, received_on: "2026-02-01", method: "cash", note: null });
    const created = await draft(project.id);
    expect(created.deposit_applied).toBe(300);

    const { invoice: finalized } = await finalizeInvoice(created.id, actorId);
    expect(finalized.status).toBe("sent");
    expect(Number(finalized.deposit_applied)).toBe(300);
  });

  it("clamps deposit_applied to the total when a line is removed after the deposit was set", async () => {
    // Two time lines: 1h @ 100 (100) and 9h @ 100 (900). Subtotal 1000, tax
    // 13% = 130, total 1130; a 300 deposit is applied on the draft. Removing
    // the larger line drops the total to 113 -- below the 300 already
    // applied -- while still leaving one line, so this exercises the clamp
    // itself rather than the separate "needs at least one line" guard.
    const project = await createProject({
      billing_model: "hourly", hourly_rate: 100, tax_rate: 0.13,
    });
    await createTimeEntry(project.id, { hours_worked: 1, hours_billed: 1, date: "2026-03-05" });
    await createTimeEntry(project.id, { hours_worked: 9, hours_billed: 9, date: "2026-03-10" });
    await recordDeposit(project.id, { amount: 300, received_on: "2026-02-01", method: "cash", note: null });
    const created = await draft(project.id);
    expect(created.deposit_applied).toBe(300);
    expect(created.lines).toHaveLength(2);

    const bigLine = created.lines.find((l) => l.amount === 900)!;
    await removeInvoiceLine(created.id, bigLine.id, actorId);
    const { invoice: finalized } = await finalizeInvoice(created.id, actorId);

    expect(Number(finalized.total)).toBe(113);
    expect(Number(finalized.deposit_applied)).toBeLessThanOrEqual(Number(finalized.total));
    expect(Number(finalized.deposit_applied)).toBe(113);
  });

  it("finalizes an invoice whose lines net negative with deposit_applied clamped to 0", async () => {
    // Nothing requires invoices.total >= 0 -- a line's unit_amount can go
    // negative -- and the project holds no deposit at all here, so
    // Math.min(0, negativeTotal) alone would still go negative and violate
    // `check (deposit_applied >= 0)`. This is a regression test for the
    // floor on that clamp, not just the cap.
    const project = await createProject({ billing_model: "hourly", hourly_rate: 100 });
    await createTimeEntry(project.id, { hours_worked: 1, hours_billed: 1, date: "2026-03-05" });
    const created = await draft(project.id);
    expect(created.deposit_applied).toBe(0);
    expect(Number(created.total)).toBe(100);

    await addInvoiceLine(
      created.id,
      { kind: "discount", description: "Goodwill write-off", quantity: 1, unit_amount: -500 },
      actorId,
    );

    const { invoice: finalized } = await finalizeInvoice(created.id, actorId);
    expect(finalized.status).toBe("sent");
    expect(Number(finalized.total)).toBe(-400);
    expect(Number(finalized.deposit_applied)).toBe(0);
  });
});

describe("concurrent deposit auto-claims on the same project", () => {
  // finalizeInvoice's own balance-check clamp never *increases* an
  // invoice's deposit_applied -- it only validates and clamps an
  // already-committed value down -- so two concurrent finalizeInvoice calls
  // alone cannot double-spend a deposit (whichever runs, its outcome
  // depends only on the sibling's static, already-committed value, which a
  // finalize never changes). The genuine race is in the two places that
  // *increase* a claim after reading the balance: the deposit PATCH route,
  // and createDraftInvoice's own auto-claim on creation, both against the
  // same unlocked "sum siblings" read. This test exercises the latter,
  // which is the same bug in the same file the finding named, at the one
  // claim-increasing call site the finding's line numbers didn't cover.
  //
  // Caveat verified by hand, not by this test: `test/setup/setup-file.ts`
  // pins `DATABASE_POOL_MAX=1` for the whole suite (deliberately, to keep
  // `resetDatabase` from interleaving with a neighbouring test's queries).
  // With one physical connection, two `sql.begin()` calls against the
  // shared client can never truly overlap inside a test run -- the second
  // waits for the first to release the connection regardless of any lock
  // -- so this assertion would hold even against the pre-fix code, in this
  // harness. I confirmed the mechanism the honest way instead: temporarily
  // removed the `for update` this test depends on and inserted an
  // artificial `pg_sleep` between the balance read and the write inside
  // `createDraftInvoice`, and still could not get two concurrent calls to
  // double-claim under this pool -- exactly because the pool serializes
  // them before the lock ever gets a chance to matter. So treat this test
  // as an invariant/regression guard on the arithmetic, not as proof the
  // lock fixes a race -- that proof is the `for update` semantics
  // themselves (a standard, well-documented Postgres guarantee), not
  // anything this suite can exercise with a single-connection pool.
  it("never lets two drafts jointly auto-claim more than the project's deposit", async () => {
    const project = await createProject({ billing_model: "hourly", hourly_rate: 100, tax_rate: 0 });
    await recordDeposit(project.id, { amount: 1000, received_on: "2026-01-01", method: "etransfer", note: null });
    // Two non-overlapping periods, each worth exactly the whole deposit, so
    // each draft's own auto-claim is individually valid but the two would
    // sum to double the deposit if both raced past the same unlocked read.
    await createTimeEntry(project.id, { hours_worked: 10, hours_billed: 10, date: "2026-03-10" });
    await createTimeEntry(project.id, { hours_worked: 10, hours_billed: 10, date: "2026-04-10" });

    const [a, b] = await Promise.all([
      createDraftInvoice({ projectId: project.id, periodStart: "2026-03-01", periodEnd: "2026-03-31", actorId }),
      createDraftInvoice({ projectId: project.id, periodStart: "2026-04-01", periodEnd: "2026-04-30", actorId }),
    ]);

    expect(Number(a.deposit_applied) + Number(b.deposit_applied)).toBeLessThanOrEqual(1000);
    const balance = await getDepositBalance(project.id);
    expect(balance.applied).toBeLessThanOrEqual(balance.received);
    expect(balance.remaining).toBeGreaterThanOrEqual(0);
  });
});
