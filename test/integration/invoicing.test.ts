import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import {
  addInvoiceLine,
  createDraftInvoice,
  deleteDraftInvoice,
  finalizeInvoice,
  getInvoice,
  markInvoicePaid,
  removeInvoiceLine,
  setInvoicePublished,
  voidInvoice,
} from "@/lib/invoices/engine";
import { computeTotals } from "@/lib/invoices/totals";
import {
  createInternalUser,
  createProject,
  createTimeEntry,
  resetDatabase,
} from "../setup/factories";

/**
 * The invoice lifecycle, exercised through the engine against the real schema.
 *
 * Everything here is money or history, so the assertions are exact: a number
 * is the number, a total is to the cent, and "cannot be undone" is tested by
 * actually trying to undo it. The database's own guards are in play throughout
 * -- several of these cases pass only because a trigger refuses, not because
 * the engine remembered to check.
 */

const YEAR = new Date().getUTCFullYear();
const n = (value: number) => String(value).padStart(3, "0");

let actorId: string;

beforeEach(async () => {
  await resetDatabase();
  actorId = (await createInternalUser()).id;
});


async function hourlyProject(overrides: Parameters<typeof createProject>[0] = {}) {
  return createProject({ billing_model: "hourly", hourly_rate: 200, ...overrides });
}

async function draftFor(projectId: string, start = "2026-03-01", end = "2026-03-31") {
  return createDraftInvoice({
    projectId,
    periodStart: start,
    periodEnd: end,
    actorId,
  });
}

/* -------------------------------------------------------------------------- */

describe("the full lifecycle", () => {
  it("runs draft -> finalize -> mark paid -> publish, and records every step", async () => {
    const project = await hourlyProject();
    await createTimeEntry(project.id, {
      date: "2026-03-05",
      hours_worked: 4,
      hours_billed: 4,
      description: "Ingest pipeline",
    });

    const draft = await draftFor(project.id);
    expect(draft.status).toBe("draft");
    expect(draft.number).toBeNull();
    expect(draft.lines).toHaveLength(1);
    expect(draft.total).toBe(800);

    const { invoice: finalized } = await finalizeInvoice(draft.id, actorId);
    expect(finalized.status).toBe("sent");
    expect(finalized.number).toBe(`${YEAR}-${n(1)}`);
    expect(finalized.finalized_at).not.toBeNull();
    expect(finalized.sent_at).not.toBeNull();
    expect(finalized.published_at).toBeNull();

    const paid = await markInvoicePaid(draft.id, "etransfer", "Cleared next morning", actorId);
    expect(paid.status).toBe("paid");
    expect(paid.payment_method).toBe("etransfer");
    expect(paid.payment_note).toBe("Cleared next morning");
    expect(paid.paid_at).not.toBeNull();

    const published = await setInvoicePublished(draft.id, true, actorId);
    expect(published.published_at).not.toBeNull();
    expect(published.status).toBe("paid");

    const trail = await sql<{ action: string }[]>`
      select action from audit_log where entity_id = ${draft.id} order by created_at
    `;
    expect(trail.map((row) => row.action)).toEqual([
      "invoice.create",
      "invoice.finalize",
      "invoice.mark_paid",
      "invoice.publish",
    ]);
  });

  it("lets a draft be edited and deleted before it is finalized", async () => {
    const project = await hourlyProject();
    await createTimeEntry(project.id, { date: "2026-03-05", hours_worked: 2, hours_billed: 2 });
    const draft = await draftFor(project.id);

    const withExtra = await addInvoiceLine(
      draft.id,
      { kind: "adhoc", description: "Domain renewal", quantity: 1, unit_amount: 42.5 },
      actorId,
    );
    expect(withExtra.lines).toHaveLength(2);
    expect(withExtra.total).toBe(442.5);

    const trimmed = await removeInvoiceLine(draft.id, withExtra.lines[1].id, actorId);
    expect(trimmed.lines).toHaveLength(1);
    expect(trimmed.total).toBe(400);

    await deleteDraftInvoice(draft.id, actorId);
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from invoices where id = ${draft.id}
    `;
    expect(count).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("numbering", () => {
  it("assigns sequential YYYY-NNN numbers", async () => {
    const first = await hourlyProject();
    const second = await hourlyProject();
    await createTimeEntry(first.id, { date: "2026-03-05" });
    await createTimeEntry(second.id, { date: "2026-03-06" });
    await createTimeEntry(first.id, { date: "2026-04-05" });

    const a = await finalizeInvoice((await draftFor(first.id)).id, actorId);
    const b = await finalizeInvoice((await draftFor(second.id)).id, actorId);
    const c = await finalizeInvoice(
      (await draftFor(first.id, "2026-04-01", "2026-04-30")).id,
      actorId,
    );

    expect([a.invoice.number, b.invoice.number, c.invoice.number]).toEqual([
      `${YEAR}-${n(1)}`,
      `${YEAR}-${n(2)}`,
      `${YEAR}-${n(3)}`,
    ]);
  });

  it("never lets two invoices share a number", async () => {
    const project = await hourlyProject();
    await createTimeEntry(project.id, { date: "2026-03-05" });
    await createTimeEntry(project.id, { date: "2026-04-05" });

    const first = await finalizeInvoice((await draftFor(project.id)).id, actorId);
    const second = await finalizeInvoice(
      (await draftFor(project.id, "2026-04-01", "2026-04-30")).id,
      actorId,
    );
    expect(first.invoice.number).not.toBe(second.invoice.number);

    // The unique index is the backstop under the counter: even a hand-written
    // insert cannot reuse a number that has gone out.
    await expect(
      sql`
        insert into invoices (project_id, number, status, period_start, period_end,
                              currency, subtotal, tax_amount, total, finalized_at)
        values (${project.id}, ${first.invoice.number}, 'sent', '2026-05-01', '2026-05-31',
                'USD', 10, 0, 10, now())
      `,
    ).rejects.toThrow(/duplicate key/);

    const numbers = await sql<{ number: string }[]>`
      select number from invoices where number is not null
    `;
    expect(new Set(numbers.map((row) => row.number)).size).toBe(numbers.length);
  });
});

/* -------------------------------------------------------------------------- */

describe("finalize locks the period's time", () => {
  it("attaches every unbilled entry inside the period, and nothing outside it", async () => {
    const project = await hourlyProject();
    const inside = await createTimeEntry(project.id, { date: "2026-03-15" });
    const edge = await createTimeEntry(project.id, { date: "2026-03-31" });
    const outside = await createTimeEntry(project.id, { date: "2026-04-02" });

    const draft = await draftFor(project.id);
    await finalizeInvoice(draft.id, actorId);

    const rows = await sql<{ id: string; invoice_id: string | null }[]>`
      select id, invoice_id from time_entries order by date
    `;
    const byId = new Map(rows.map((row) => [row.id, row.invoice_id]));
    expect(byId.get(inside.id)).toBe(draft.id);
    expect(byId.get(edge.id)).toBe(draft.id);
    expect(byId.get(outside.id)).toBeNull();
  });

  it("makes the locked entries read-only", async () => {
    const project = await hourlyProject();
    const entry = await createTimeEntry(project.id, { date: "2026-03-15" });
    const draft = await draftFor(project.id);
    await finalizeInvoice(draft.id, actorId);

    await expect(
      sql`update time_entries set hours_billed = 1 where id = ${entry.id}`,
    ).rejects.toThrow(/time_entry_locked/);
    await expect(sql`delete from time_entries where id = ${entry.id}`).rejects.toThrow(
      /time_entry_locked/,
    );
  });
});

/* -------------------------------------------------------------------------- */

describe("a finalized invoice is immutable", () => {
  async function finalized() {
    const project = await hourlyProject();
    await createTimeEntry(project.id, { date: "2026-03-05", hours_worked: 3, hours_billed: 3 });
    const draft = await draftFor(project.id);
    await finalizeInvoice(draft.id, actorId);
    return draft.id;
  }

  it("refuses an edit", async () => {
    const id = await finalized();
    await expect(sql`update invoices set total = 1 where id = ${id}`).rejects.toThrow(
      /invoice_immutable/,
    );
    await expect(
      sql`update invoices set period_end = '2026-04-30' where id = ${id}`,
    ).rejects.toThrow(/invoice_immutable/);
    expect((await getInvoice(id)).total).toBe(600);
  });

  it("refuses a new line", async () => {
    const id = await finalized();
    await expect(
      addInvoiceLine(
        id,
        { kind: "adhoc", description: "Snuck in", quantity: 1, unit_amount: 500 },
        actorId,
      ),
    ).rejects.toThrow(/invoice_immutable/);
    const after = await getInvoice(id);
    expect(after.lines).toHaveLength(1);
    expect(after.total).toBe(600);
  });

  it("refuses deletion", async () => {
    const id = await finalized();
    await expect(deleteDraftInvoice(id, actorId)).rejects.toThrow(/draft/i);
    await expect(sql`delete from invoices where id = ${id}`).rejects.toThrow(/invoice_immutable/);
    expect((await getInvoice(id)).status).toBe("sent");
  });
});

/* -------------------------------------------------------------------------- */

describe("void and reissue", () => {
  it("releases the time entries, clears publication, and retires the number", async () => {
    const project = await hourlyProject();
    const entry = await createTimeEntry(project.id, { date: "2026-03-15", hours_worked: 5, hours_billed: 5 });

    const mistake = await draftFor(project.id);
    const { invoice: issued } = await finalizeInvoice(mistake.id, actorId);
    await setInvoicePublished(mistake.id, true, actorId);
    expect(issued.number).toBe(`${YEAR}-${n(1)}`);

    const voided = await voidInvoice(mistake.id, actorId);
    expect(voided.status).toBe("void");
    expect(voided.voided_at).not.toBeNull();
    expect(voided.published_at).toBeNull();
    // The number stays on the void record; it is retired, not erased.
    expect(voided.number).toBe(`${YEAR}-${n(1)}`);

    const [released] = await sql<{ invoice_id: string | null }[]>`
      select invoice_id from time_entries where id = ${entry.id}
    `;
    expect(released.invoice_id).toBeNull();

    // Released means editable again, not merely unlinked.
    await sql`update time_entries set hours_billed = 4 where id = ${entry.id}`;

    // The reissue picks up the released work and takes the *next* number.
    const reissue = await draftFor(project.id);
    expect(reissue.lines.length).toBeGreaterThan(0);
    const { invoice: replacement } = await finalizeInvoice(reissue.id, actorId);
    expect(replacement.number).toBe(`${YEAR}-${n(2)}`);
  });

  it("is terminal", async () => {
    const project = await hourlyProject();
    await createTimeEntry(project.id, { date: "2026-03-15" });
    const draft = await draftFor(project.id);
    await finalizeInvoice(draft.id, actorId);
    await voidInvoice(draft.id, actorId);

    await expect(voidInvoice(draft.id, actorId)).rejects.toThrow(/already void/i);
    await expect(markInvoicePaid(draft.id, "cash", null, actorId)).rejects.toThrow(/void/i);
  });
});

/* -------------------------------------------------------------------------- */

describe("totals are exact to the cent", () => {
  it("handles a 5% tax over a goodwill discount line", async () => {
    const project = await createProject({
      billing_model: "hourly",
      hourly_rate: 150,
      tax_rate: 0.05,
    });
    await createTimeEntry(project.id, {
      date: "2026-03-11",
      hours_worked: 6.5,
      hours_billed: 5.25,
      discount_reason: "Rework on my own bug",
      description: "Scheduler",
    });

    const draft = await draftFor(project.id);
    const [time, discount] = draft.lines;

    expect(time.kind).toBe("time");
    expect(time.quantity).toBe(6.5);
    expect(time.amount).toBe(975);

    expect(discount.kind).toBe("discount");
    expect(discount.quantity).toBe(-1.25);
    expect(discount.amount).toBe(-187.5);
    expect(discount.description).toContain("Rework on my own bug");

    // 787.50 subtotal; 5% is 39.375, which must round to 39.38, not 39.37.
    expect(draft.subtotal).toBe(787.5);
    expect(draft.tax_amount).toBe(39.38);
    expect(draft.total).toBe(826.88);

    // The pure function and the stored row agree.
    expect(computeTotals(draft.lines, 0.05)).toEqual({
      subtotal: 787.5,
      taxable_subtotal: 787.5,
      tax_amount: 39.38,
      total: 826.88,
    });

    const { invoice: finalized } = await finalizeInvoice(draft.id, actorId);
    expect(finalized.subtotal).toBe(787.5);
    expect(finalized.tax_amount).toBe(39.38);
    expect(finalized.total).toBe(826.88);
  });

  it("does not drift across many lines", async () => {
    const project = await createProject({
      billing_model: "hourly",
      hourly_rate: 137.5,
      tax_rate: 0.05,
    });
    for (let day = 1; day <= 20; day += 1) {
      await createTimeEntry(project.id, {
        date: `2026-03-${String(day).padStart(2, "0")}`,
        hours_worked: 0.75,
        hours_billed: 0.75,
      });
    }

    const draft = await draftFor(project.id);
    expect(draft.lines).toHaveLength(20);
    // 0.75 x 137.50 = 103.125, which must round up to 103.13 on every line
    // rather than being summed as a float and rounded once at the end.
    expect(draft.lines.every((line) => line.amount === 103.13)).toBe(true);
    expect(draft.subtotal).toBe(2062.6);
    expect(draft.tax_amount).toBe(103.13);
    expect(draft.total).toBe(2165.73);
  });
});

/* -------------------------------------------------------------------------- */

describe("publication", () => {
  it("rejects publishing a draft", async () => {
    const project = await hourlyProject();
    await createTimeEntry(project.id, { date: "2026-03-05" });
    const draft = await draftFor(project.id);

    await expect(setInvoicePublished(draft.id, true, actorId)).rejects.toThrow(
      /only a finalized invoice/i,
    );
    const [row] = await sql<{ published_at: string | null }[]>`
      select published_at from invoices where id = ${draft.id}
    `;
    expect(row.published_at).toBeNull();
  });

  it("is reversible once finalized", async () => {
    const project = await hourlyProject();
    await createTimeEntry(project.id, { date: "2026-03-05" });
    const draft = await draftFor(project.id);
    await finalizeInvoice(draft.id, actorId);

    expect((await setInvoicePublished(draft.id, true, actorId)).published_at).not.toBeNull();
    expect((await setInvoicePublished(draft.id, false, actorId)).published_at).toBeNull();
  });
});
