import { fromCents, toCents } from "@/lib/format";

export interface TotalsLine {
  amount: number;
  taxable: boolean;
}

export interface InvoiceTotals {
  subtotal: number;
  taxable_subtotal: number;
  tax_amount: number;
  total: number;
}

/**
 * The one definition of how an invoice adds up.
 *
 * Pure -- no database imports -- so the draft editor, which is a client
 * component and cannot import `engine.ts` without dragging `sql` into the
 * bundle, shares this exact function rather than keeping a copy. Two copies of
 * a tax calculation is how a draft preview and a client's finalized invoice
 * come to disagree.
 *
 * Integer cents throughout: a fifty-line invoice must not drift by a penny.
 *
 * A non-taxable line joins the subtotal but not the taxable base. A
 * pass-through cost may already have carried its tax; taxing it again
 * over-collects on money that was never marked up.
 */
export function computeTotals(lines: TotalsLine[], taxRate: number): InvoiceTotals {
  const subtotalCents = lines.reduce((sum, line) => sum + toCents(line.amount), 0);
  const taxableCents = lines.reduce(
    // `!== false` rather than a truthy check: if `taxable` is `undefined` --
    // deploy-before-migrate, where the column doesn't exist yet and a caller
    // did `select *` instead of the explicit `select amount, taxable` --
    // treat the line as taxable. That matches the column's own `default
    // true` and every line's behaviour before this feature existed. It also
    // pushes the bad ordering's failure to a place that fails loudly
    // (recomputeAndStore's explicit column list throws when the column is
    // missing) instead of finalizeInvoice silently computing `tax_amount = 0`
    // and freezing it onto an invoice that can never be corrected in place.
    (sum, line) => sum + (line.taxable !== false ? toCents(line.amount) : 0),
    0,
  );
  const taxCents = Math.round(taxableCents * taxRate);
  return {
    subtotal: fromCents(subtotalCents),
    taxable_subtotal: fromCents(taxableCents),
    tax_amount: fromCents(taxCents),
    total: fromCents(subtotalCents + taxCents),
  };
}
