import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import {
  InvoiceDocument,
  TOTALS_BLOCK_HEIGHT,
  type InvoicePdfData,
  type InvoicePdfLine,
} from "@/lib/pdf/invoice-pdf";

/**
 * The line table is a flex row per line. react-pdf's Yoga has no min-content
 * floor the way a browser does: if the description column's basis is its
 * unwrapped text width, a long description widens that column and the
 * numeric columns shrink to make room -- and their numbers, which cannot
 * shrink, spill leftward over the description. So the invariant under test is
 * that column geometry is a property of the table, not of any row's content.
 */

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface TextLine {
  /** The width the line was wrapped at -- not the width of its glyphs. */
  box: { x: number; y: number; width: number; height: number };
  runs: { positions: { xAdvance: number }[] }[];
  string: string;
}
interface LaidOutNode {
  type: string;
  box?: Box;
  children?: LaidOutNode[];
  lines?: TextLine[];
}

/** The ink width of a wrapped line: the sum of its glyph advances, in points. */
function advanceWidth(line: TextLine): number {
  return line.runs.reduce(
    (sum, run) => sum + run.positions.reduce((a, p) => a + p.xAdvance, 0),
    0,
  );
}

const A4_CONTENT_WIDTH = 595.28 - 2 * 56; // page width minus paddingHorizontal

const data: InvoicePdfData = {
  number: "2026-014",
  status: "sent",
  issue_date: "2026-09-04",
  period_start: "2026-04-07",
  period_end: "2026-08-29",
  currency: "CAD",
  tax_rate: 0,
  subtotal: 1860,
  tax_amount: 0,
  total: 1860,
  deposit_applied: 0,
  notes: null,
  payment_instructions: null,
  payment_method: null,
  paid_at: null,
  project: { name: "Greenhouse Operations", billing_model: "hourly" },
  client: { name: "Northwind Botanicals", contact_name: "A. Contact", contact_email: null },
  company: { name: "Fathom Software", email: "ops@example.com", address: "Port Alder BC" },
};

/**
 * The totals block at its tallest: every optional row rendered at once
 * (taxable subtotal, tax, deposit applied, paid). The exact money figures
 * here are not meant to reconcile with any line set -- correctness of the
 * arithmetic is covered elsewhere (`test/unit/invoice-totals.test.ts` and the
 * integration suite); this fixture exists purely to force every row into
 * existence so the block's real rendered height can be measured.
 */
const maxTotalsData: InvoicePdfData = {
  ...data,
  status: "paid",
  tax_rate: 0.08,
  tax_amount: 96,
  deposit_applied: 500,
  total: 836,
  paid_at: "2026-09-01",
};

const lines: InvoicePdfLine[] = [
  {
    id: "short",
    kind: "time",
    description: "2026-04-07 — Discovery workshop",
    quantity: 3.5,
    unit_amount: 120,
    amount: 420,
    taxable: true,
  },
  {
    id: "one-line-too-wide",
    kind: "time",
    description: "2026-04-14 — Propagation calendar overhaul (three greenhouse sites - North/South/Annex) + bench allocation grid",
    quantity: 7,
    unit_amount: 120,
    amount: 840,
    taxable: true,
  },
  {
    id: "wraps",
    kind: "time",
    description:
      "2026-08-29 — Grower profile build out, germination tracking and tray photo system, daily check-in cadence, progressive web app launch",
    quantity: 5,
    unit_amount: 120,
    amount: 600,
    taxable: true,
  },
];

/** Line rows are the only four-child rows whose first cell is a View. */
function collectLineRows(node: LaidOutNode, out: LaidOutNode[] = []): LaidOutNode[] {
  const kids = node.children ?? [];
  if (kids.length === 4 && kids[0].type === "VIEW" && kids[1].type === "TEXT") out.push(node);
  for (const kid of kids) collectLineRows(kid, out);
  return out;
}

function textOf(node: LaidOutNode): string {
  const own = node.lines?.map((line) => line.string).join("") ?? "";
  return own + (node.children ?? []).map(textOf).join("");
}

/** Every node anywhere in the tree whose own box is (approximately) this wide. */
function findByWidth(node: LaidOutNode, width: number, out: LaidOutNode[] = []): LaidOutNode[] {
  if (node.box && Math.abs(node.box.width - width) < 0.5) out.push(node);
  for (const kid of node.children ?? []) findByWidth(kid, width, out);
  return out;
}

/**
 * The totals block itself (`s.totals`, `width: 244` in invoice-pdf.tsx) --
 * the one node whose height plus its wrapper's top margin is what
 * `TOTALS_BLOCK_HEIGHT` has to cover.
 *
 * Every row inside it is *also* a `width: 244` View (children stretch to
 * fill a fixed-width parent by default), so `findByWidth` alone matches the
 * block and every row in it. Requiring text from three rows that never
 * appear together outside the outer block -- the subtotal, the deposit row,
 * and the paid line -- narrows it back down to exactly one match.
 */
function totalsBlock(root: LaidOutNode): LaidOutNode {
  const candidates = findByWidth(root, 244).filter((n) => {
    const text = textOf(n);
    return text.includes("Subtotal") && text.includes("Deposit applied") && text.includes("Paid ");
  });
  expect(candidates, "expected exactly one totals block (width 244)").toHaveLength(1);
  const [block] = candidates;
  if (!block) throw new Error("unreachable: length checked above");
  return block;
}

async function layout(pdfLines: InvoicePdfLine[], pdfData: InvoicePdfData = data): Promise<LaidOutNode> {
  let laidOut: LaidOutNode | undefined;
  await renderToBuffer(
    createElement(InvoiceDocument, {
      data: pdfData,
      lines: pdfLines,
      onRender: (props) => {
        laidOut = (props as { _INTERNAL__LAYOUT__DATA_?: LaidOutNode })._INTERNAL__LAYOUT__DATA_;
      },
    }),
  );
  if (!laidOut) throw new Error("onRender did not receive the layout tree");
  return laidOut;
}

async function layoutLineRows(): Promise<LaidOutNode[]> {
  const rows = collectLineRows(await layout(lines));
  expect(rows).toHaveLength(lines.length);
  return rows;
}

/** Enough two-line rows that the totals block lands on a page of its own. */
function manyLines(count: number): InvoicePdfLine[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `line-${i}`,
    kind: "time" as const,
    description: `2026-06-${String(1 + (i % 28)).padStart(2, "0")} — Watering schedule rework + individual bench previous cycle moisture display + Zones db compat`,
    quantity: 4,
    unit_amount: 120,
    amount: 480,
    taxable: true,
  }));
}

/**
 * Same shape as `manyLines`, except the first line is a non-taxable
 * pass-through -- enough to force the "Taxable subtotal" row into a
 * paginated invoice, so the totals block that lands on the last page is the
 * maximum-height one, not the ordinary one.
 */
function manyLinesWithNonTaxable(count: number): InvoicePdfLine[] {
  return manyLines(count).map((line, i) => (i === 0 ? { ...line, taxable: false } : line));
}

describe("invoice PDF line table", () => {
  it("gives every row the same column widths regardless of description length", async () => {
    const rows = await layoutLineRows();
    const widths = rows.map((row) => row.children!.map((cell) => Math.round(cell.box!.width)));
    for (const row of widths) expect(row).toEqual(widths[0]);
    // And those widths fill the row exactly: nothing overflowed or was squeezed.
    expect(widths[0].reduce((sum, w) => sum + w, 0)).toBeCloseTo(A4_CONTENT_WIDTH, 0);
  });

  it("never strands the totals on a page with no line rows", async () => {
    // Sweep a range of lengths: whichever count leaves the totals block alone
    // under the repeated table header is the one that matters.
    for (const count of [14, 18, 22, 26, 30, 34]) {
      const pages = (await layout(manyLines(count))).children ?? [];
      expect(pages.length).toBeGreaterThan(1);
      for (const page of pages) {
        const hasTotals = (page.children ?? []).some((n) => textOf(n).includes("Subtotal"));
        if (!hasTotals) continue;
        expect(collectLineRows(page).length, `${count} lines, ${pages.length} pages`).toBeGreaterThan(0);
      }
    }
  });

  it("never strands the maximum-height totals block either", async () => {
    // Every optional row present at once (taxable subtotal, tax, deposit,
    // paid) is the tallest the block gets -- and the two commits immediately
    // before this one were both PDF layout fixes, so this combination is
    // measured, not assumed.
    for (const count of [14, 18, 22, 26, 30, 34]) {
      const pages = (await layout(manyLinesWithNonTaxable(count), maxTotalsData)).children ?? [];
      expect(pages.length).toBeGreaterThan(1);
      for (const page of pages) {
        const hasTotals = (page.children ?? []).some((n) => textOf(n).includes("Subtotal"));
        if (!hasTotals) continue;
        expect(collectLineRows(page).length, `${count} lines, ${pages.length} pages`).toBeGreaterThan(0);
      }
    }
  });

  it("measures the maximum-height totals block against TOTALS_BLOCK_HEIGHT", async () => {
    // Isolated from pagination: a short line list, so the totals block
    // renders in full rather than possibly being cut by a page boundary,
    // and its real height can be read straight off the layout tree.
    const mixedLines = lines.map((line, i) => (i === 0 ? { ...line, taxable: false } : line));
    const laidOut = await layout(mixedLines, maxTotalsData);
    const block = totalsBlock(laidOut);
    const text = textOf(block);

    // Sanity: every optional row this measurement is meant to capture is
    // actually present, or this would silently measure a smaller block.
    // ("AMOUNT DUE" is upper-cased by the grand row's own text-transform.)
    expect(text).toContain("Taxable subtotal");
    expect(text).toContain("Tax (");
    expect(text).toContain("Deposit applied");
    expect(text).toContain("AMOUNT DUE");
    expect(text).toContain("Paid ");

    // `s.totalsWrap`'s marginTop in invoice-pdf.tsx -- the space between the
    // last line row and the totals block itself, which `minPresenceAhead`
    // also has to reserve.
    const TOTALS_WRAP_MARGIN_TOP = 14;
    const neededSpace = TOTALS_WRAP_MARGIN_TOP + block.box!.height;

    expect(
      neededSpace,
      `measured ${neededSpace.toFixed(1)}pt (${TOTALS_WRAP_MARGIN_TOP}pt margin + ` +
        `${block.box!.height.toFixed(1)}pt block) against TOTALS_BLOCK_HEIGHT = ${TOTALS_BLOCK_HEIGHT}pt`,
    ).toBeLessThanOrEqual(TOTALS_BLOCK_HEIGHT);
  });

  it("draws the footer inside the page on every page", async () => {
    const pages = (await layout(manyLines(30))).children ?? [];
    expect(pages.length).toBeGreaterThan(1);
    for (const [i, page] of pages.entries()) {
      const footer = (page.children ?? []).find((n) => textOf(n).includes("Invoice 2026-014"));
      expect(footer, `page ${i + 1}`).toBeDefined();
      const box = footer!.box!;
      expect(box.top, `page ${i + 1} footer top`).toBeGreaterThan(page.box!.height * 0.85);
      expect(box.top + box.height, `page ${i + 1} footer bottom`).toBeLessThanOrEqual(page.box!.height);
      // The "Page N of M" text is a `render` prop, resolved after this layout
      // snapshot is taken, so it is empty here; its geometry is what the
      // footer bug broke, and that is what the assertions above cover.
    }
  });

  it("wraps between words, never inside them", async () => {
    // Every description in `manyLines` wraps to two lines and contains no
    // hyphen, so any line ending in one was made by the hyphenator.
    const rows = collectLineRows(await layout(manyLines(3)));
    for (const row of rows) {
      const text = row.children![0].children![0];
      expect(text.lines!.length).toBeGreaterThan(1);
      for (const line of text.lines!) {
        expect(line.string.trimEnd(), JSON.stringify(line.string)).not.toMatch(/-$/);
      }
    }
  });

  it("keeps description text inside its own column", async () => {
    const rows = await layoutLineRows();
    for (const row of rows) {
      const [desc, qty] = row.children!;
      const text = desc.children![0];
      expect(text.lines?.length).toBeGreaterThan(0);
      for (const line of text.lines ?? []) {
        const inkRight = text.box!.left + line.box.x + advanceWidth(line);
        expect(inkRight, JSON.stringify(line.string.trimEnd())).toBeLessThanOrEqual(
          qty.box!.left + 0.5,
        );
      }
    }
  });
});

/**
 * The taxable-subtotal row is the only place a non-taxable charge is
 * explained to the client -- it is what lets them reconcile a tax figure that
 * isn't `rate x subtotal`. It is guarded by a runtime recomputation over the
 * rendered lines (`computeTotals(lines, tax_rate).taxable_subtotal !==
 * data.subtotal`), so a regression in what the caller passes as `subtotal`
 * would silently change what every client sees -- this is the presence test
 * that protects it, distinct from the layout tests above.
 */
describe("invoice PDF taxable subtotal row", () => {
  it("renders when a line is non-taxable", async () => {
    const mixedLines = lines.map((line, i) => (i === 0 ? { ...line, taxable: false } : line));
    const text = textOf(await layout(mixedLines));
    expect(text).toContain("Taxable subtotal");
  });

  it("is absent when every line is taxable", async () => {
    // `lines` and `data.subtotal` (1860) already agree -- this is the case
    // that must render exactly as it did before charges existed.
    const text = textOf(await layout(lines));
    expect(text).not.toContain("Taxable subtotal");
  });
});
