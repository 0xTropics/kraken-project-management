import { cn } from "@/lib/cn";
import { formatDate, formatMoney } from "@/lib/format";
import type { InvoiceDetail } from "@/lib/data/invoices";
import { billingModelDescription } from "@/lib/billing-model";
import { LINE_KIND_TAG, lineQuantityLabel } from "@/lib/invoices/line-display";
import { computeTotals } from "@/lib/invoices/totals";

/**
 * A finalized invoice, typeset.
 *
 * Once finalized the record is immutable, so nothing here is an
 * input — not even a disabled one. A disabled field still reads as "editable,
 * but not right now", which is exactly the wrong thing to say about a document
 * that has already gone to a client. Every value is set as type.
 *
 * This deliberately mirrors `lib/pdf/invoice-pdf.tsx`: the screen and the PDF
 * should be recognisably the same document.
 */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.09em] text-[var(--text-tertiary)]">
      {children}
    </p>
  );
}

export function InvoiceDocument({
  invoice,
  company,
}: {
  invoice: InvoiceDetail;
  company: { name: string; email: string; address: string };
}) {
  const isVoid = invoice.status === "void";
  const showTax = invoice.tax_rate > 0;
  const taxPercent = invoice.tax_rate * 100;
  const taxLabel = `Tax (${taxPercent % 1 === 0 ? taxPercent.toFixed(0) : taxPercent.toFixed(2)}%)`;
  const taxableSubtotal = computeTotals(invoice.lines, invoice.tax_rate).taxable_subtotal;
  const showTaxableSubtotal = taxableSubtotal !== invoice.subtotal;
  const addressLines = company.address
    .split(/\r?\n|,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--bg-panel)]",
        "px-5 py-6 shadow-[var(--shadow-card)] sm:px-8 sm:py-9",
        isVoid ? "border-[var(--danger)]" : "border-[var(--border-subtle)]",
      )}
    >
      {/* A void invoice must be unmistakable at a glance, from across a desk. */}
      {isVoid && (
        <span
          aria-hidden="true"
          style={{ opacity: 0.07 }}
          className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center"
        >
          <span className="-rotate-12 whitespace-nowrap text-[6rem] font-bold uppercase leading-none tracking-[0.2em] text-[var(--danger)] sm:text-[9rem]">
            Void
          </span>
        </span>
      )}

      <div className="relative z-[1]">
        {/* Letterhead ---------------------------------------------------- */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-[var(--text-primary)]">{company.name}</p>
            {company.email && (
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{company.email}</p>
            )}
            {addressLines.map((line) => (
              <p key={line} className="text-xs text-[var(--text-tertiary)]">
                {line}
              </p>
            ))}
          </div>
          <div className="text-right">
            <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              Invoice
            </p>
            <p className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {invoice.number ?? "Draft"}
            </p>
            {(invoice.status === "paid" || isVoid) && (
              <span
                className={cn(
                  "mt-1.5 inline-flex rounded-[var(--radius-xs)] border px-1.5 py-0.5",
                  "text-2xs font-bold uppercase tracking-[0.14em]",
                  invoice.status === "paid"
                    ? "border-[var(--success)] text-[var(--success-text)]"
                    : "border-[var(--danger)] text-[var(--danger-text)]",
                )}
              >
                {invoice.status === "paid" ? "Paid" : "Void"}
              </span>
            )}
          </div>
        </header>

        <hr className="my-6 border-[var(--border-subtle)]" />

        {/* Parties -------------------------------------------------------- */}
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="min-w-0">
            <Label>Billed to</Label>
            <p className="truncate text-base font-medium text-[var(--text-primary)]">
              {invoice.project.client_name}
            </p>
            {invoice.project.client_contact_name && (
              <p className="truncate text-sm text-[var(--text-secondary)]">
                {invoice.project.client_contact_name}
              </p>
            )}
            {invoice.project.client_contact_email && (
              <p className="truncate text-sm text-[var(--text-secondary)]">
                {invoice.project.client_contact_email}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <Label>Project</Label>
            <p className="truncate text-base font-medium text-[var(--text-primary)]">
              {invoice.project.name}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              {billingModelDescription(invoice.project.billing_model)}
            </p>
          </div>
          <div className="min-w-0">
            <Label>Details</Label>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-tertiary)]">Issued</dt>
                <dd className="tabular-nums text-[var(--text-primary)]">
                  {formatDate((invoice.finalized_at ?? invoice.created_at).slice(0, 10))}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-tertiary)]">Period</dt>
                <dd className="tabular-nums text-[var(--text-primary)]">
                  {formatDate(invoice.period_start)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-tertiary)]">to</dt>
                <dd className="tabular-nums text-[var(--text-primary)]">
                  {formatDate(invoice.period_end)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-tertiary)]">Currency</dt>
                <dd className="tabular-nums text-[var(--text-primary)]">{invoice.currency}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Lines ---------------------------------------------------------- */}
        <div
          className="scroll-thin mt-8 overflow-x-auto focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          tabIndex={0}
          role="region"
          aria-label="Invoice lines"
        >
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-tertiary)]">
                <th
                  scope="col"
                  className="py-2 pr-3 text-left text-2xs font-semibold uppercase tracking-[0.09em]"
                >
                  Description
                </th>
                <th
                  scope="col"
                  className="w-20 py-2 px-3 text-right text-2xs font-semibold uppercase tracking-[0.09em]"
                >
                  Qty
                </th>
                <th
                  scope="col"
                  className="w-28 py-2 px-3 text-right text-2xs font-semibold uppercase tracking-[0.09em]"
                >
                  Rate
                </th>
                <th
                  scope="col"
                  className="w-32 py-2 pl-3 text-right text-2xs font-semibold uppercase tracking-[0.09em]"
                >
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {invoice.lines.map((line) => {
                const credit = line.amount < 0;
                const tag = LINE_KIND_TAG[line.kind];
                return (
                  <tr key={line.id}>
                    <td className="py-2.5 pr-3 align-top">
                      <p
                        className={cn(
                          credit ? "text-[var(--danger-text)]" : "text-[var(--text-primary)]",
                        )}
                      >
                        {line.description}
                      </p>
                      {tag && (
                        <p className="mt-0.5 text-2xs text-[var(--text-tertiary)]">{tag}</p>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right align-top tabular-nums text-[var(--text-secondary)]">
                      {lineQuantityLabel(line)}
                    </td>
                    <td className="py-2.5 px-3 text-right align-top tabular-nums text-[var(--text-secondary)]">
                      {line.unit_amount === 0 && line.kind === "adhoc"
                        ? "—"
                        : formatMoney(line.unit_amount, invoice.currency)}
                    </td>
                    <td
                      className={cn(
                        "py-2.5 pl-3 text-right align-top font-medium tabular-nums",
                        credit ? "text-[var(--danger-text)]" : "text-[var(--text-primary)]",
                      )}
                    >
                      {formatMoney(line.amount, invoice.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals --------------------------------------------------------- */}
        <div className="mt-5 flex justify-end">
          <div className="w-full max-w-xs">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--text-tertiary)]">Subtotal</dt>
                <dd className="tabular-nums text-[var(--text-primary)]">
                  {formatMoney(invoice.subtotal, invoice.currency)}
                </dd>
              </div>
              {/*
               * A non-taxable line (a pass-through charge) joins the subtotal
               * but not the taxable base -- shown only when the two differ, so
               * an invoice where every line is taxable renders exactly as it
               * did before this feature existed.
               */}
              {showTaxableSubtotal && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-tertiary)]">Taxable subtotal</dt>
                  <dd className="tabular-nums text-[var(--text-primary)]">
                    {formatMoney(taxableSubtotal, invoice.currency)}
                  </dd>
                </div>
              )}
              {/* The tax line only exists when there is tax. */}
              {showTax && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-tertiary)]">{taxLabel}</dt>
                  <dd className="tabular-nums text-[var(--text-primary)]">
                    {formatMoney(invoice.tax_amount, invoice.currency)}
                  </dd>
                </div>
              )}
              {/*
               * Deposits are a column on the invoice row, not a line on it — this
               * is what would make that visible even if the wording didn't: it
               * sits below tax, never inside the subtotal that tax was computed
               * on. Shown only when non-zero, so an invoice with no deposit reads
               * exactly as it did before this feature existed.
               */}
              {invoice.deposit_applied > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--text-tertiary)]">Deposit applied</dt>
                  <dd className="tabular-nums text-[var(--danger-text)]">
                    -{formatMoney(invoice.deposit_applied, invoice.currency)}
                  </dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-4 border-t border-[var(--border-default)] pt-2.5">
                <dt className="text-2xs font-semibold uppercase tracking-[0.09em] text-[var(--text-primary)]">
                  Amount due {invoice.currency}
                </dt>
                <dd
                  className={cn(
                    "text-xl font-semibold tabular-nums text-[var(--text-primary)]",
                    isVoid && "line-through",
                  )}
                >
                  {formatMoney(invoice.total - invoice.deposit_applied, invoice.currency)}
                </dd>
              </div>
            </dl>
            {invoice.status === "paid" && (
              <p className="pt-1 text-right text-xs text-[var(--success-text)]">
                Paid {formatDate(invoice.paid_at?.slice(0, 10))}
                {invoice.payment_method ? ` by ${invoice.payment_method}` : ""}
              </p>
            )}
          </div>
        </div>

        {/* Instructions and notes ----------------------------------------- */}
        {(invoice.payment_instructions || invoice.notes) && (
          <div className="mt-9 space-y-5">
            {invoice.payment_instructions && (
              <section className="border-t border-[var(--border-subtle)] pt-4">
                <Label>Payment instructions</Label>
                <p className="max-w-prose whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">
                  {invoice.payment_instructions}
                </p>
              </section>
            )}
            {invoice.notes && (
              <section className="border-t border-[var(--border-subtle)] pt-4">
                <Label>Notes</Label>
                <p className="max-w-prose whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">
                  {invoice.notes}
                </p>
              </section>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
