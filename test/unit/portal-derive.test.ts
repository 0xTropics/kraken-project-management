import { describe, expect, it } from "vitest";
import {
  buildBoard,
  outstandingTotal,
  hoursInvoicedToDate,
  lastUpdateAt,
} from "@/lib/portal/derive";
import type { PortalWorkItem, PortalInvoice, PortalHours, PortalUpdate } from "@/lib/data/portal";

/**
 * The board's rules, away from any markup. There is no React testing stack in
 * this repo, so anything with a rule in it has to live in a pure function or it
 * is only ever covered end to end.
 */

function item(over: Partial<PortalWorkItem> = {}): PortalWorkItem {
  return {
    id: over.id ?? "i1",
    title: over.title ?? "An item",
    description: over.description ?? null,
    type: over.type ?? "feature",
    status: over.status ?? "planned",
    completed_at: over.completed_at ?? null,
    milestone_id: null,
    milestone_name: over.milestone_name ?? null,
    milestone_status: null,
    milestone_target_date: over.milestone_target_date ?? null,
  } as PortalWorkItem;
}

function invoice(over: Partial<PortalInvoice> = {}): PortalInvoice {
  return {
    id: over.id ?? "inv1",
    number: over.number ?? "2026-001",
    status: over.status ?? "sent",
    period_start: "2026-01-01",
    period_end: "2026-01-31",
    currency: "CAD",
    total: over.total ?? 1000,
    deposit_applied: over.deposit_applied ?? 0,
    published_at: "2026-02-01T00:00:00.000Z",
    paid_at: null,
    has_pdf: true,
  } as PortalInvoice;
}

describe("buildBoard", () => {
  it("returns exactly the three statuses a client may see, in order", () => {
    const columns = buildBoard([]);
    expect(columns.map((c) => c.status)).toEqual(["planned", "in_progress", "done"]);
    expect(columns.map((c) => c.label)).toEqual(["Planned", "In progress", "Done"]);
  });

  it("places each item in the column its status names", () => {
    const columns = buildBoard([
        item({ id: "a", status: "planned" }),
        item({ id: "b", status: "in_progress" }),
        item({ id: "c", status: "done" }),
      ]);
    expect(columns[0].items.map((i) => i.id)).toEqual(["a"]);
    expect(columns[1].items.map((i) => i.id)).toEqual(["b"]);
    expect(columns[2].items.map((i) => i.id)).toEqual(["c"]);
  });

  it("puts every type in the same columns — a chore is not special", () => {
    const columns = buildBoard([
      item({ id: "feat", status: "in_progress", type: "feature" }),
      item({ id: "bug", status: "in_progress", type: "bug" }),
      item({ id: "chore", status: "in_progress", type: "chore" }),
    ]);
    expect(columns[1].items.map((i) => i.id).sort()).toEqual(["bug", "chore", "feat"]);
  });

  it("orders Done newest first, with undated items last", () => {
    const columns = buildBoard([
        item({ id: "old", status: "done", completed_at: "2026-01-01T00:00:00.000Z" }),
        item({ id: "undated", status: "done", completed_at: null }),
        item({ id: "new", status: "done", completed_at: "2026-03-01T00:00:00.000Z" }),
      ]);
    expect(columns[2].items.map((i) => i.id)).toEqual(["new", "old", "undated"]);
  });

  it("preserves the query's order in Planned and In progress", () => {
    // The query already orders by milestone, then sort_order, then created_at.
    // Re-sorting those columns would discard the operator's arrangement.
    const columns = buildBoard([
        item({ id: "first", status: "planned" }),
        item({ id: "second", status: "planned" }),
        item({ id: "third", status: "planned" }),
      ]);
    expect(columns[0].items.map((i) => i.id)).toEqual(["first", "second", "third"]);
  });

  it("drops a status the portal is not allowed to show, rather than inventing a column", () => {
    const columns = buildBoard([item({ id: "hidden", status: "backlog" as never })]);
    expect(columns).toHaveLength(3);
    expect(columns.flatMap((c) => c.items)).toHaveLength(0);
  });
});

describe("outstandingTotal", () => {
  it("nets the deposit off a sent invoice", () => {
    expect(outstandingTotal([invoice({ total: 8440, deposit_applied: 3000 })])).toBe(5440);
  });

  it("ignores paid invoices", () => {
    expect(
      outstandingTotal([invoice({ status: "paid", total: 3000 }), invoice({ total: 1000 })]),
    ).toBe(1000);
  });

  it("is zero when nothing is owed", () => {
    expect(outstandingTotal([])).toBe(0);
  });
});

describe("hoursInvoicedToDate", () => {
  it("sums the invoiced periods", () => {
    const hours = {
      current_period_hours: 18.5,
      periods: [
        { invoice_number: "2026-002", period_start: "2026-04-01", period_end: "2026-06-30", hours: 105.5 },
        { invoice_number: "2026-001", period_start: "2026-01-01", period_end: "2026-03-31", hours: 60 },
      ],
    } satisfies PortalHours;
    expect(hoursInvoicedToDate(hours)).toBe(165.5);
  });

  it("is zero for a retainer project, which has no hours at all", () => {
    expect(hoursInvoicedToDate(null)).toBe(0);
  });
});

describe("lastUpdateAt", () => {
  it("takes the newest, because the query already sorts desc", () => {
    const updates = [
      { created_at: "2026-09-02T00:00:00.000Z" },
      { created_at: "2026-08-28T00:00:00.000Z" },
    ] as PortalUpdate[];
    expect(lastUpdateAt(updates)).toBe("2026-09-02T00:00:00.000Z");
  });

  it("is null when nothing has been published", () => {
    expect(lastUpdateAt([])).toBeNull();
  });
});
