import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import type { InvoiceDetail, InvoiceDetailProject } from "@/lib/data/invoices";
import type { InvoiceLine } from "@/lib/db/types";

/**
 * The taxable-subtotal row is the only place a non-taxable charge is
 * explained to the client -- it is what lets them reconcile a tax figure that
 * isn't `rate x subtotal`. It is guarded by a runtime recomputation over
 * `invoice.lines` (`computeTotals(invoice.lines, invoice.tax_rate)
 * .taxable_subtotal !== invoice.subtotal`), so a regression in what
 * `getInvoiceDetail` selects would silently change what every client sees.
 * `invoice-pdf.tsx` has a layout test but no presence test; this component
 * had neither. Rendered via `react-dom/server` (no jsdom in this project's
 * Vitest config) -- static markup is enough to assert text presence.
 */

const project: InvoiceDetailProject = {
  id: "project-1",
  name: "Greenhouse Operations",
  slug: "greenhouse-ops",
  status: "active",
  billing_model: "hourly",
  hourly_rate: 120,
  retainer_amount: null,
  payment_instructions: null,
  client_name: "Northwind Botanicals",
  client_contact_name: null,
  client_contact_email: null,
};

const company = { name: "Fathom Software", email: "ops@example.com", address: "Port Alder BC" };

function line(overrides: Partial<InvoiceLine>): InvoiceLine {
  return {
    id: "line-1",
    invoice_id: "invoice-1",
    kind: "adhoc",
    description: "Shipping",
    quantity: 1,
    unit_amount: 38.4,
    amount: 38.4,
    charge_id: null,
    taxable: true,
    sort_order: 0,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function invoice(lines: InvoiceLine[], overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  return {
    id: "invoice-1",
    project_id: "project-1",
    number: "2026-050",
    status: "sent",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    currency: "USD",
    tax_rate: 0.13,
    subtotal,
    tax_amount: 0,
    total: subtotal,
    deposit_applied: 0,
    notes: null,
    payment_instructions: null,
    payment_method: null,
    payment_note: null,
    published_at: null,
    finalized_at: "2026-09-01T00:00:00Z",
    sent_at: "2026-09-01T00:00:00Z",
    paid_at: null,
    voided_at: null,
    pdf_path: null,
    created_at: "2026-08-01T00:00:00Z",
    project,
    lines,
    time_entries: [],
    ...overrides,
  };
}

function render(detail: InvoiceDetail): string {
  return renderToStaticMarkup(createElement(InvoiceDocument, { invoice: detail, company }));
}

describe("InvoiceDocument taxable subtotal row", () => {
  it("renders when a line is non-taxable", () => {
    const html = render(
      invoice([
        line({ id: "a", description: "Landing page", amount: 500, taxable: true }),
        line({ id: "b", description: "Shipping", amount: 38.4, taxable: false }),
      ]),
    );
    expect(html).toContain("Taxable subtotal");
  });

  it("is absent when every line is taxable", () => {
    // This is the assertion that protects every historical invoice: a
    // regression that always showed the row, or mis-summed the taxable base,
    // would still pass a presence-only check.
    const html = render(
      invoice([line({ id: "a", description: "Landing page", amount: 500, taxable: true })]),
    );
    expect(html).not.toContain("Taxable subtotal");
  });
});

describe("InvoiceDocument for a build + maintenance invoice", () => {
  it("names the model, tags the lines, and reads the term in months", () => {
    const html = render(
      invoice(
        [
          line({ id: "a", kind: "maintenance", description: "Website maintenance — Oct 2026 to Sep 2027", quantity: 12, unit_amount: 150, amount: 1800 }),
          line({ id: "b", kind: "maintenance", description: "Prepay discount — 12 months", quantity: 1, unit_amount: -180, amount: -180 }),
          line({ id: "c", kind: "build", description: "2026-09-02 — 50% on signing", quantity: 1, unit_amount: 2500, amount: 2500 }),
        ],
        { project: { ...project, billing_model: "maintenance" } },
      ),
    );
    expect(html).toContain("Website build and maintenance");
    expect(html).not.toContain("Time and materials");
    expect(html).toContain("Maintenance");
    expect(html).toContain("12 mo");
    expect(html).toContain("Build");
    expect(html).toContain("Prepay discount — 12 months");
  });
});
