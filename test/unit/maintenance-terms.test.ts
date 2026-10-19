import { describe, expect, it } from "vitest";
import { formatDate, fromCents, toCents } from "@/lib/format";
import {
  coverageSummary,
  maintenanceLines,
  nextTermPeriod,
  prepaySaving,
  termEnd,
  termPriceCents,
  termSpanLabel,
} from "@/lib/invoices/maintenance";
import { computeTotals } from "@/lib/invoices/totals";

/** What the engine stores as a line's amount: integer cents, exactly as engine.ts computes it. */
function amountOf(line: { quantity: number; unit: number }): number {
  return fromCents(Math.round(toCents(line.unit) * line.quantity));
}

function totalsOf(lines: { quantity: number; unit: number }[], taxRate: number) {
  return computeTotals(lines.map((line) => ({ amount: amountOf(line), taxable: true })), taxRate);
}

describe("termEnd", () => {
  it.each([
    ["2026-10-01", 1, "2026-10-31"],
    ["2026-10-01", 6, "2027-03-31"],
    ["2026-10-01", 12, "2027-09-30"],
    ["2026-09-01", 6, "2027-02-28"],
    ["2027-09-01", 6, "2028-02-29"],
    ["2026-02-01", 1, "2026-02-28"],
    ["2026-12-01", 1, "2026-12-31"],
  ])("%s plus %i months ends %s", (start, months, end) => {
    expect(termEnd(start, months)).toBe(end);
  });
});

describe("nextTermPeriod", () => {
  it("starts at the start month when nothing is covered", () => {
    expect(nextTermPeriod([], "2026-10-01", 12)).toEqual({
      start: "2026-10-01",
      end: "2027-09-30",
      months: 12,
    });
  });

  it("starts the day after coverage", () => {
    expect(nextTermPeriod([{ start: "2026-10-01", end: "2027-09-30" }], "2026-10-01", 1)).toEqual({
      start: "2027-10-01",
      end: "2027-10-31",
      months: 1,
    });
  });

  it("skips a lapse when the start month is moved past coverage", () => {
    expect(nextTermPeriod([{ start: "2026-10-01", end: "2026-12-31" }], "2027-04-01", 6).start).toBe("2027-04-01");
  });

  it("crosses a year boundary", () => {
    expect(nextTermPeriod([{ start: "2026-01-01", end: "2026-11-30" }], "2026-01-01", 12)).toEqual({
      start: "2026-12-01",
      end: "2027-11-30",
      months: 12,
    });
  });
});

describe("nextTermPeriod over a hole", () => {
  const september = { start: "2026-09-01", end: "2026-09-30" };
  const october = { start: "2026-10-01", end: "2026-10-31" };

  it("fills the earliest uncovered month before later coverage", () => {
    expect(nextTermPeriod([october], "2026-09-01", 1)).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
      months: 1,
    });
  });

  it("caps a longer term at the hole, so it never overlaps later coverage", () => {
    expect(nextTermPeriod([october], "2026-09-01", 12)).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
      months: 1,
    });
  });

  it("skips over contiguous coverage to the first real gap", () => {
    const december = { start: "2026-12-01", end: "2026-12-31" };
    expect(nextTermPeriod([september, october, december], "2026-09-01", 6)).toEqual({
      start: "2026-11-01",
      end: "2026-11-30",
      months: 1,
    });
  });

  it("refills a voided 12-month term in full when the hole is that long", () => {
    const nextYear = { start: "2027-10-01", end: "2028-09-30" };
    expect(nextTermPeriod([nextYear], "2026-10-01", 12)).toEqual({
      start: "2026-10-01",
      end: "2027-09-30",
      months: 12,
    });
  });

  it("ignores coverage before the start month", () => {
    expect(nextTermPeriod([september], "2027-01-01", 1).start).toBe("2027-01-01");
  });
});

describe("maintenanceLines", () => {
  it("bills a 12-month prepay at full price with a discount line, taxed on the discounted total", () => {
    const pricing = { maintenance_monthly: 150, maintenance_price_6: null, maintenance_price_12: 1620 };
    const lines = maintenanceLines(pricing, nextTermPeriod([], "2026-10-01", 12));

    expect(lines).toEqual([
      { kind: "maintenance", description: "Website maintenance — Oct 2026 to Sep 2027", quantity: 12, unit: 150 },
      { kind: "maintenance", description: "Prepay discount — 12 months", quantity: 1, unit: -180 },
    ]);
    expect(lines.map(amountOf)).toEqual([1800, -180]);
    expect(totalsOf(lines, 0.13)).toMatchObject({ subtotal: 1620, tax_amount: 210.6, total: 1830.6 });
  });

  it("gets a price that does not divide evenly right to the cent", () => {
    const pricing = { maintenance_monthly: 149.99, maintenance_price_6: 849, maintenance_price_12: null };
    const lines = maintenanceLines(pricing, nextTermPeriod([], "2026-10-01", 6));

    expect(lines.map(amountOf)).toEqual([899.94, -50.94]);
    expect(totalsOf(lines, 0.13)).toMatchObject({ subtotal: 849, tax_amount: 110.37, total: 959.37 });
  });

  it("bills one month as a single line named for the month", () => {
    const pricing = { maintenance_monthly: 150, maintenance_price_6: 840, maintenance_price_12: 1620 };
    expect(maintenanceLines(pricing, nextTermPeriod([], "2026-10-01", 1))).toEqual([
      { kind: "maintenance", description: "Website maintenance — October 2026", quantity: 1, unit: 150 },
    ]);
  });

  it("adds no discount line when no prepay price is set, or it equals the full price", () => {
    const period = nextTermPeriod([], "2026-10-01", 6);
    expect(maintenanceLines({ maintenance_monthly: 150, maintenance_price_6: null, maintenance_price_12: null }, period)).toHaveLength(1);
    expect(maintenanceLines({ maintenance_monthly: 150, maintenance_price_6: 900, maintenance_price_12: null }, period)).toHaveLength(1);
  });
});

describe("termPriceCents", () => {
  it("is months × monthly without a prepay price, and the prepay price with one", () => {
    const pricing = { maintenance_monthly: 150, maintenance_price_6: null, maintenance_price_12: 1620 };
    expect(termPriceCents(pricing, 1)).toBe(15000);
    expect(termPriceCents(pricing, 6)).toBe(90000);
    expect(termPriceCents(pricing, 12)).toBe(162000);
  });
});

describe("termSpanLabel", () => {
  it("names one month in full and a term by its first and last month", () => {
    expect(termSpanLabel(nextTermPeriod([], "2026-09-01", 1))).toBe("September 2026");
    expect(termSpanLabel(nextTermPeriod([], "2026-09-01", 12))).toBe("Sep 2026 to Aug 2027");
  });
});

describe("prepaySaving", () => {
  it("reports the saving and the percentage", () => {
    expect(prepaySaving(150, 1620, 12)).toEqual({ saving: 180, percent: 10 });
    expect(prepaySaving(150, 840, 6)).toEqual({ saving: 60, percent: 6.7 });
  });
  it("reports zero at full price and a negative saving above it", () => {
    expect(prepaySaving(150, 1800, 12)).toEqual({ saving: 0, percent: 0 });
    expect(prepaySaving(150, 1900, 12)?.saving).toBe(-100);
  });
  it("is null until both figures are usable", () => {
    expect(prepaySaving(0, 1620, 12)).toBeNull();
    expect(prepaySaving(150, Number.NaN, 12)).toBeNull();
  });
});

describe("coverageSummary", () => {
  it("describes a project with nothing invoiced", () => {
    expect(coverageSummary(null, "2026-10-01", "2026-09-28")).toBe(
      `Starts ${formatDate("2026-10-01")} · nothing invoiced yet`,
    );
  });
  it("describes live and lapsed coverage", () => {
    expect(coverageSummary("2027-09-30", "2027-10-01", "2026-09-28")).toBe(
      `Covered through ${formatDate("2027-09-30")}`,
    );
    expect(coverageSummary("2026-06-30", "2026-07-01", "2026-09-28")).toBe(
      `Lapsed · covered through ${formatDate("2026-06-30")}`,
    );
  });
});
