import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import {
  LOCKED_MESSAGE,
  createTimeEntry as logTime,
  deleteTimeEntry,
  timeEntryCreateInput,
  updateTimeEntry,
  type TimeActor,
} from "@/lib/data/time";
import {
  csvCell,
  getRevenueReport,
  getUtilizationReport,
  revenueCsv,
  summariseRevenue,
  toCsv,
} from "@/lib/data/reports";
import type { Currency, InvoiceStatus } from "@/lib/db/types";
import {
  createClient,
  createProject,
  createTimeEntry,
  createWorkItem,
  resetDatabase,
} from "../setup/factories";

/**
 * Time entry writes and the two reports, against the real schema.
 *
 * The interesting cases are all refusals: an entry that has become invoice
 * history, hours billed that exceed hours worked, a work item borrowed from
 * another project. Each is checked at the layer a user actually reaches, and
 * the row is re-read afterwards to prove the refusal was not merely cosmetic.
 */

const actor: TimeActor = { userId: randomUUID(), email: "operator@example.com" };

beforeEach(resetDatabase);

interface InvoiceInput {
  projectId: string;
  status: InvoiceStatus;
  number?: string | null;
  from: string;
  to: string;
  currency?: Currency;
  subtotal?: number;
  tax?: number;
  /** When it was issued. Defaults to now. */
  finalizedAt?: string;
}

/** Invoices straight into the table: the invoice engine is another module's. */
async function insertInvoice(input: InvoiceInput): Promise<{ id: string }> {
  const subtotal = input.subtotal ?? 1000;
  const tax = input.tax ?? 0;
  const finalized = input.status !== "draft";
  const [row] = await sql<{ id: string }[]>`
    insert into invoices (
      project_id, number, status, period_start, period_end, currency,
      subtotal, tax_amount, total, finalized_at, sent_at, paid_at,
      payment_method, voided_at
    ) values (
      ${input.projectId},
      ${input.status === "draft" ? null : (input.number ?? `2026-${randomUUID().slice(0, 3)}`)},
      ${input.status},
      ${input.from},
      ${input.to},
      ${input.currency ?? "USD"},
      ${subtotal},
      ${tax},
      ${subtotal + tax},
      ${finalized ? (input.finalizedAt ?? new Date().toISOString()) : null},
      ${finalized ? new Date().toISOString() : null},
      ${input.status === "paid" ? new Date().toISOString() : null},
      ${input.status === "paid" ? "etransfer" : null},
      ${input.status === "void" ? new Date().toISOString() : null}
    )
    returning id
  `;
  return row;
}

/* -------------------------------------------------------------------------- */
/* Locked entries                                                              */
/* -------------------------------------------------------------------------- */

describe("an entry on a finalized invoice is history", () => {
  async function lockedEntry() {
    const project = await createProject({ billing_model: "hourly", hourly_rate: 165 });
    const entry = await createTimeEntry(project.id, {
      date: "2026-03-10",
      hours_worked: 4,
      hours_billed: 4,
      description: "Bench allocation grid",
    });
    const invoice = await insertInvoice({
      projectId: project.id,
      status: "sent",
      number: "2026-101",
      from: "2026-03-01",
      to: "2026-03-31",
      subtotal: 660,
    });
    await sql`update time_entries set invoice_id = ${invoice.id} where id = ${entry.id}`;
    return { project, entry, invoice };
  }

  it("refuses PATCH with a 409 that names void-and-reissue", async () => {
    const { entry } = await lockedEntry();

    await expect(updateTimeEntry(entry.id, { hours_worked: 9 }, actor)).rejects.toMatchObject({
      status: 409,
      code: "time_entry_locked",
      message: LOCKED_MESSAGE,
    });
    expect(LOCKED_MESSAGE).toMatch(/void that invoice and reissue/i);

    const [after] = await sql<{ hours_worked: number }[]>`
      select hours_worked from time_entries where id = ${entry.id}
    `;
    expect(after.hours_worked).toBe(4);
  });

  it("refuses DELETE with the same conflict, and the row survives", async () => {
    const { entry } = await lockedEntry();

    await expect(deleteTimeEntry(entry.id, actor)).rejects.toMatchObject({
      status: 409,
      code: "time_entry_locked",
      message: expect.stringMatching(/void that invoice and reissue/i),
    });

    const rows = await sql`select id from time_entries where id = ${entry.id}`;
    expect(rows).toHaveLength(1);
  });

  it("still allows edits to an unlocked entry on the same project", async () => {
    const { project } = await lockedEntry();
    const free = await createTimeEntry(project.id, { date: "2026-04-02", hours_worked: 2 });

    const updated = await updateTimeEntry(free.id, { hours_worked: 3 }, actor);

    expect(updated.hours_worked).toBe(3);
    // Raising worked hours must not silently raise what is billed.
    expect(updated.hours_billed).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Billed vs worked                                                            */
/* -------------------------------------------------------------------------- */

describe("hours billed can never exceed hours worked", () => {
  it("is rejected by the create schema before a query is issued", () => {
    const result = timeEntryCreateInput.safeParse({
      project_id: randomUUID(),
      date: "2026-03-10",
      hours_worked: 3,
      hours_billed: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "Billed hours cannot exceed worked hours",
    );
  });

  it("is rejected by updateTimeEntry as a conflict", async () => {
    const project = await createProject();
    const entry = await createTimeEntry(project.id, { hours_worked: 3, hours_billed: 3 });

    await expect(updateTimeEntry(entry.id, { hours_billed: 5 }, actor)).rejects.toMatchObject({
      status: 409,
      code: "billed_exceeds_worked",
    });

    const [after] = await sql<{ hours_billed: number }[]>`
      select hours_billed from time_entries where id = ${entry.id}
    `;
    expect(after.hours_billed).toBe(3);
  });

  it("lowering worked hours drags billed down with it rather than failing", async () => {
    const project = await createProject();
    const entry = await createTimeEntry(project.id, { hours_worked: 6, hours_billed: 6 });

    const updated = await updateTimeEntry(entry.id, { hours_worked: 2 }, actor);

    expect(updated.hours_worked).toBe(2);
    expect(updated.hours_billed).toBe(2);
  });

  it("is rejected by the database even when the schema is bypassed", async () => {
    const project = await createProject();
    await expect(
      logTime(
        // The zod refine is skipped on purpose: the check constraint is the
        // backstop, and it has to hold on its own.
        { project_id: project.id, date: "2026-03-10", hours_worked: 2, hours_billed: 4 },
        actor,
      ),
    ).rejects.toThrow(/billed_lte_worked/);
  });
});

/* -------------------------------------------------------------------------- */
/* Cross-project work items                                                    */
/* -------------------------------------------------------------------------- */

describe("a work item belongs to exactly one project", () => {
  it("refuses a create that borrows another project's work item, as a 404", async () => {
    const mine = await createProject({ slug: "mine" });
    const theirs = await createProject({ slug: "theirs" });
    const item = await createWorkItem(theirs.id, { title: "Their feature" });

    // A 404, not a 403 -- the caller learns nothing about whether the
    // id exists at all.
    await expect(
      logTime(
        {
          project_id: mine.id,
          date: "2026-03-10",
          hours_worked: 2,
          work_item_id: item.id,
        },
        actor,
      ),
    ).rejects.toMatchObject({ status: 404, message: expect.stringMatching(/not on this project/i) });

    const rows = await sql`select id from time_entries where project_id = ${mine.id}`;
    expect(rows).toHaveLength(0);
  });

  it("refuses the same move on update", async () => {
    const mine = await createProject({ slug: "mine-2" });
    const theirs = await createProject({ slug: "theirs-2" });
    const item = await createWorkItem(theirs.id, { title: "Their feature" });
    const entry = await createTimeEntry(mine.id);

    await expect(updateTimeEntry(entry.id, { work_item_id: item.id }, actor)).rejects.toMatchObject({ status: 404 });

    const [after] = await sql<{ work_item_id: string | null }[]>`
      select work_item_id from time_entries where id = ${entry.id}
    `;
    expect(after.work_item_id).toBeNull();
  });

  it("accepts a work item that is on the project", async () => {
    const project = await createProject({ slug: "same-project" });
    const item = await createWorkItem(project.id, { title: "Our feature" });

    const entry = await logTime(
      { project_id: project.id, date: "2026-03-10", hours_worked: 2, work_item_id: item.id },
      actor,
    );

    expect(entry.work_item_id).toBe(item.id);
    expect(entry.work_item_title).toBe("Our feature");
    // hours_billed defaults to hours_worked.
    expect(entry.hours_billed).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Revenue report                                                              */
/* -------------------------------------------------------------------------- */

describe("getRevenueReport", () => {
  it("counts only sent and paid invoices, and never merges currencies", async () => {
    const client = await createClient({ name: "Halcyon" });
    const usd = await createProject({ client_id: client.id, currency: "USD", slug: "halcyon-usd" });
    const cad = await createProject({ client_id: client.id, currency: "CAD", slug: "halcyon-cad" });

    await insertInvoice({
      projectId: usd.id,
      status: "sent",
      number: "2026-201",
      from: "2026-03-01",
      to: "2026-03-31",
      currency: "USD",
      subtotal: 1000,
    });
    await insertInvoice({
      projectId: cad.id,
      status: "paid",
      number: "2026-202",
      from: "2026-03-01",
      to: "2026-03-31",
      currency: "CAD",
      subtotal: 2000,
      tax: 100,
    });
    // Neither of these is income: a draft was never issued, and a void was
    // withdrawn.
    await insertInvoice({
      projectId: usd.id,
      status: "draft",
      from: "2026-03-01",
      to: "2026-03-31",
      currency: "USD",
      subtotal: 9999,
    });
    await insertInvoice({
      projectId: usd.id,
      status: "void",
      number: "2026-203",
      from: "2026-03-01",
      to: "2026-03-31",
      currency: "USD",
      subtotal: 8888,
    });

    const rows = await getRevenueReport({ from: "2026-01-01", to: "2026-12-31" });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.month === "2026-03")).toBe(true);
    expect(rows.every((row) => row.client_name === "Halcyon")).toBe(true);

    const byCurrency = Object.fromEntries(rows.map((row) => [row.currency, row]));
    expect(byCurrency.USD.total).toBe(1000);
    expect(byCurrency.USD.paid_total).toBe(0);
    expect(byCurrency.CAD.total).toBe(2100);
    expect(byCurrency.CAD.paid_total).toBe(2100);
    expect(byCurrency.CAD.tax_amount).toBe(100);
    // One row per currency, each counting one invoice: 9999 and 8888 are absent.
    expect(rows.map((row) => row.invoice_count)).toEqual([1, 1]);

    const totals = summariseRevenue(rows);
    expect(totals.map((total) => total.currency).sort()).toEqual(["CAD", "USD"]);
    expect(totals.find((total) => total.currency === "USD")?.outstanding).toBe(1000);
    expect(totals.find((total) => total.currency === "CAD")?.outstanding).toBe(0);
  });

  it("counts a prepaid term in the month it was issued, not the month it ends", async () => {
    const project = await createProject({ billing_model: "maintenance", currency: "USD", slug: "prepay-bucket" });
    await insertInvoice({
      projectId: project.id,
      status: "sent",
      number: "2026-401",
      from: "2026-10-01",
      to: "2027-09-30",
      subtotal: 1620,
      finalizedAt: "2026-10-02T15:00:00Z",
    });

    const thisYear = await getRevenueReport({ from: "2026-01-01", to: "2026-12-31" });
    expect(thisYear.map((row) => [row.month, row.total])).toEqual([["2026-10", 1620]]);
    expect(await getRevenueReport({ from: "2027-01-01", to: "2027-12-31" })).toEqual([]);
  });

  it("keeps an invoice issued after its period in its period's month", async () => {
    const project = await createProject({ currency: "USD", slug: "late-issue" });
    await insertInvoice({
      projectId: project.id,
      status: "sent",
      number: "2026-402",
      from: "2026-03-01",
      to: "2026-03-31",
      subtotal: 800,
      finalizedAt: "2026-04-03T09:00:00Z",
    });

    const rows = await getRevenueReport({ from: "2026-01-01", to: "2026-12-31" });
    expect(rows.map((row) => row.month)).toEqual(["2026-03"]);
  });

  it("buckets on the period, not the issue date, and honours the range", async () => {
    const project = await createProject({ currency: "USD", slug: "bucketing" });
    await insertInvoice({
      projectId: project.id,
      status: "sent",
      number: "2026-301",
      from: "2026-02-01",
      to: "2026-02-28",
      subtotal: 500,
    });
    await insertInvoice({
      projectId: project.id,
      status: "sent",
      number: "2026-302",
      from: "2026-05-01",
      to: "2026-05-31",
      subtotal: 700,
    });

    const q1 = await getRevenueReport({ from: "2026-01-01", to: "2026-03-31" });
    expect(q1).toHaveLength(1);
    expect(q1[0].month).toBe("2026-02");
    expect(q1[0].total).toBe(500);
  });
});

/* -------------------------------------------------------------------------- */
/* Utilization report                                                          */
/* -------------------------------------------------------------------------- */

describe("getUtilizationReport", () => {
  const range = { from: "2026-03-01", to: "2026-03-31" };

  it("computes an hourly project's effective rate from billed hours at its rate", async () => {
    const project = await createProject({
      billing_model: "hourly",
      hourly_rate: 200,
      currency: "USD",
      slug: "hourly-maths",
      name: "Hourly maths",
    });
    // 10 worked, 8 billed: two hours written off as goodwill.
    await createTimeEntry(project.id, { date: "2026-03-05", hours_worked: 6, hours_billed: 6 });
    await createTimeEntry(project.id, { date: "2026-03-06", hours_worked: 4, hours_billed: 2 });
    // Outside the range, so it must not move any of the numbers.
    await createTimeEntry(project.id, { date: "2026-04-01", hours_worked: 20, hours_billed: 20 });

    const [row] = await getUtilizationReport(range);

    expect(row.hours_worked).toBe(10);
    expect(row.hours_billed).toBe(8);
    expect(row.billed_amount).toBe(1600);
    // 1600 / 10 worked = 160, a fifth below the 200 nominal.
    expect(row.effective_rate).toBe(160);
    expect(row.nominal_rate).toBe(200);
  });

  it("honours a per-entry rate override", async () => {
    const project = await createProject({
      billing_model: "hourly",
      hourly_rate: 100,
      currency: "USD",
      slug: "override-maths",
    });
    await createTimeEntry(project.id, { date: "2026-03-05", hours_worked: 5, hours_billed: 5 });
    await createTimeEntry(project.id, {
      date: "2026-03-06",
      hours_worked: 5,
      hours_billed: 5,
      rate_override: 300,
    });

    const [row] = await getUtilizationReport(range);

    // 5 * 100 + 5 * 300 = 2000, over 10 hours worked.
    expect(row.billed_amount).toBe(2000);
    expect(row.effective_rate).toBe(200);
  });

  it("divides a prepaid maintenance term by the hours worked in the month it was issued", async () => {
    const project = await createProject({ billing_model: "maintenance", currency: "USD", slug: "maint-util" });
    await createTimeEntry(project.id, { date: "2026-10-05", hours_worked: 10, hours_billed: 10 });
    await insertInvoice({
      projectId: project.id,
      status: "sent",
      number: "2026-403",
      from: "2026-10-01",
      to: "2027-09-30",
      subtotal: 1620,
      finalizedAt: "2026-10-02T15:00:00Z",
    });

    const [row] = await getUtilizationReport({ from: "2026-10-01", to: "2026-10-31" });
    expect(row?.billed_amount).toBe(1620);
    expect(row?.effective_rate).toBe(162);
  });

  it("divides a retainer by the hours it really took", async () => {
    const project = await createProject({
      billing_model: "retainer",
      retainer_amount: 4000,
      currency: "CAD",
      slug: "retainer-maths",
    });
    await insertInvoice({
      projectId: project.id,
      status: "paid",
      number: "2026-401",
      from: "2026-03-01",
      to: "2026-03-31",
      currency: "CAD",
      subtotal: 4000,
      tax: 200,
    });
    await createTimeEntry(project.id, { date: "2026-03-04", hours_worked: 20, hours_billed: 20 });
    await createTimeEntry(project.id, { date: "2026-03-11", hours_worked: 20, hours_billed: 20 });
    await createTimeEntry(project.id, { date: "2026-03-18", hours_worked: 10, hours_billed: 10 });

    const [row] = await getUtilizationReport(range);

    expect(row.billing_model).toBe("retainer");
    // The retainer's subtotal, not its taxed total, is the revenue.
    expect(row.billed_amount).toBe(4000);
    expect(row.hours_worked).toBe(50);
    // 4000 / 50 = 80/h. A retainer has no nominal rate to compare against.
    expect(row.effective_rate).toBe(80);
    expect(row.nominal_rate).toBeNull();
  });

  it("keeps the two billing models on separate rows, in their own currencies", async () => {
    const hourly = await createProject({
      billing_model: "hourly",
      hourly_rate: 150,
      currency: "USD",
      slug: "mixed-hourly",
      name: "Alpha",
    });
    const retainer = await createProject({
      billing_model: "retainer",
      retainer_amount: 3000,
      currency: "CAD",
      slug: "mixed-retainer",
      name: "Beta",
    });
    await createTimeEntry(hourly.id, { date: "2026-03-05", hours_worked: 10, hours_billed: 10 });
    await createTimeEntry(retainer.id, { date: "2026-03-05", hours_worked: 20, hours_billed: 20 });
    await createTimeEntry(retainer.id, { date: "2026-03-06", hours_worked: 20, hours_billed: 20 });
    await createTimeEntry(retainer.id, { date: "2026-03-07", hours_worked: 20, hours_billed: 20 });
    await insertInvoice({
      projectId: retainer.id,
      status: "sent",
      number: "2026-402",
      from: "2026-03-01",
      to: "2026-03-31",
      currency: "CAD",
      subtotal: 3000,
    });

    const rows = await getUtilizationReport(range);
    const byName = Object.fromEntries(rows.map((row) => [row.project_name, row]));

    expect(rows).toHaveLength(2);
    expect(byName.Alpha.currency).toBe("USD");
    expect(byName.Alpha.effective_rate).toBe(150);
    expect(byName.Beta.currency).toBe("CAD");
    expect(byName.Beta.effective_rate).toBe(50);
  });

  it("leaves the effective rate null when nothing was worked", async () => {
    const project = await createProject({
      billing_model: "retainer",
      retainer_amount: 2500,
      currency: "USD",
      slug: "no-hours",
    });
    await insertInvoice({
      projectId: project.id,
      status: "sent",
      number: "2026-403",
      from: "2026-03-01",
      to: "2026-03-31",
      subtotal: 2500,
    });

    const [row] = await getUtilizationReport(range);

    expect(row.hours_worked).toBe(0);
    expect(row.billed_amount).toBe(2500);
    expect(row.effective_rate).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

describe("csvCell", () => {
  it("quotes a field containing a comma", () => {
    expect(csvCell("Bench grid, capacity maths")).toBe('"Bench grid, capacity maths"');
  });

  it("doubles inner quotes and wraps the field", () => {
    expect(csvCell('He said "ship it"')).toBe('"He said ""ship it"""');
  });

  it("quotes a field containing a newline", () => {
    expect(csvCell("First line\nSecond line")).toBe('"First line\nSecond line"');
    expect(csvCell("Carriage\r\nreturn")).toBe('"Carriage\r\nreturn"');
  });

  it("defuses a leading = so a spreadsheet cannot run it", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(
      '"\'=HYPERLINK(""http://evil"")"',
    );
    // The other three formula openers get the same treatment.
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@SUM")).toBe("'@SUM");
  });

  it("quotes when a formula prefix and a comma arrive together", () => {
    expect(csvCell("=SUM(A1,A2)")).toBe('"\'=SUM(A1,A2)"');
  });

  it("quotes leading or trailing whitespace so it survives the round trip", () => {
    expect(csvCell("  padded  ")).toBe('"  padded  "');
  });

  it("renders null and undefined as an empty field", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(0)).toBe("0");
  });
});

describe("toCsv", () => {
  it("joins with CRLF and ends with one, per RFC 4180", () => {
    const csv = toCsv(["A", "B"], [["1", "2"]]);
    expect(csv).toBe("A,B\r\n1,2\r\n");
  });

  it("escapes every hostile field in one row", () => {
    const csv = toCsv(
      ["Description"],
      [["=cmd|' /C calc'!A0, \"quoted\"\nand a newline"]],
    );
    expect(csv).toBe(
      'Description\r\n"\'=cmd|\' /C calc\'!A0, ""quoted""\nand a newline"\r\n',
    );
    // Header, record, trailing separator: the embedded newline never splits a
    // record, because it is inside the quotes.
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("carries a hostile description through the real revenue export", async () => {
    const client = await createClient({ name: '=SUM(A1,A2), "Acme"' });
    const project = await createProject({ client_id: client.id, slug: "csv-client" });
    await insertInvoice({
      projectId: project.id,
      status: "sent",
      number: "2026-501",
      from: "2026-03-01",
      to: "2026-03-31",
      subtotal: 1234.5,
    });

    const csv = revenueCsv(await getRevenueReport({ from: "2026-01-01", to: "2026-12-31" }));
    const [header, row] = csv.trimEnd().split("\r\n");

    expect(header.startsWith("Month,Client,Currency")).toBe(true);
    expect(row).toContain('"\'=SUM(A1,A2), ""Acme"""');
    expect(row.endsWith("1234.50,0.00,1234.50")).toBe(true);
  });
});
