import { describe, expect, it } from "vitest";
import { computeTotals } from "@/lib/invoices/totals";

describe("computeTotals", () => {
  it("taxes every line when all are taxable", () => {
    expect(computeTotals([{ amount: 7500, taxable: true }], 0.13)).toEqual({
      subtotal: 7500,
      taxable_subtotal: 7500,
      tax_amount: 975,
      total: 8475,
    });
  });

  it("keeps a non-taxable line out of the taxable base", () => {
    // 62.5h at CA$120 plus a CA$750 fixed fee, both taxable, plus a CA$38.40
    // pass-through, which is not.
    const totals = computeTotals(
      [
        { amount: 7500, taxable: true },
        { amount: 750, taxable: true },
        { amount: 38.4, taxable: false },
      ],
      0.13,
    );
    expect(totals.subtotal).toBe(8288.4);
    expect(totals.taxable_subtotal).toBe(8250);
    expect(totals.tax_amount).toBe(1072.5);
    expect(totals.total).toBe(9360.9);
  });

  it("costs 4.99 less tax than taxing the pass-through would", () => {
    const lines = [
      { amount: 7500, taxable: true },
      { amount: 750, taxable: true },
      { amount: 38.4, taxable: false },
    ];
    const correct = computeTotals(lines, 0.13);
    const allTaxed = computeTotals(
      lines.map((l) => ({ ...l, taxable: true })),
      0.13,
    );
    expect(allTaxed.tax_amount - correct.tax_amount).toBeCloseTo(4.99, 2);
  });

  it("rounds a half-cent up, not down", () => {
    // 787.50 at 5% is 39.375, which must round to 39.38.
    const totals = computeTotals([{ amount: 787.5, taxable: true }], 0.05);
    expect(totals.tax_amount).toBe(39.38);
    expect(totals.total).toBe(826.88);
  });

  it("stays in integer cents across many small lines", () => {
    const lines = Array.from({ length: 50 }, () => ({ amount: 0.1, taxable: true }));
    expect(computeTotals(lines, 0).subtotal).toBe(5);
  });

  it("treats an all-non-taxable invoice as zero tax", () => {
    const totals = computeTotals([{ amount: 100, taxable: false }], 0.13);
    expect(totals.taxable_subtotal).toBe(0);
    expect(totals.tax_amount).toBe(0);
    expect(totals.total).toBe(100);
  });
});
