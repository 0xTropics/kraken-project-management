"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Lock, Plus, Receipt, Trash2 } from "lucide-react";
import { Badge, INVOICE_STATUS_META } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/field";
import { ConfirmDialog, Modal, ModalClose, ModalContent } from "@/components/ui/modal";
import { Table, TBody, TH, THead } from "@/components/ui/table";
import { billingModelLabel } from "@/lib/billing-model";
import { cn } from "@/lib/cn";
import { lineQuantityLabel } from "@/lib/invoices/line-display";
import { api, run } from "@/lib/client-api";
import { formatDate, formatHours, formatMoney, fromCents, toCents } from "@/lib/format";
import { computeTotals } from "@/lib/invoices/totals";
import type { InvoiceDetail } from "@/lib/data/invoices";
import type { DepositBalance } from "@/lib/data/deposits";
import type { InvoiceLine, InvoiceLineKind, ProjectCharge } from "@/lib/db/types";

/**
 * The draft half of the money screen.
 *
 * A draft is the only mutable state an invoice ever has, so this is the only
 * place inputs appear. Totals are recomputed locally in integer cents on every
 * edit for immediate feedback, and the server's recomputed lines replace local
 * state on every response — the displayed number and the stored number cannot
 * drift, because the stored one always wins.
 */

interface LinesResponse {
  lines: InvoiceLine[];
}

interface ChargesSweepResponse {
  invoice: { lines: InvoiceLine[] };
}

interface DepositPatchResponse {
  deposit_applied: number;
}

const ADDABLE_KINDS: { value: Extract<InvoiceLineKind, "adhoc" | "discount">; label: string }[] = [
  { value: "adhoc", label: "Ad-hoc" },
  { value: "discount", label: "Discount" },
];

const LINE_KIND_LABEL: Record<InvoiceLineKind, string> = {
  time: "Time",
  retainer: "Retainer",
  adhoc: "Ad-hoc",
  discount: "Discount",
  maintenance: "Maintenance",
  build: "Build",
};

export function DraftEditor({
  invoice,
  unbilledCharges,
  depositBalance,
  children,
}: {
  invoice: InvoiceDetail;
  unbilledCharges: ProjectCharge[];
  depositBalance: DepositBalance;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [lines, setLines] = React.useState<InvoiceLine[]>(invoice.lines);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [finalizing, startFinalizing] = React.useTransition();
  const [addingCharges, startAddingCharges] = React.useTransition();
  const [confirmFinalize, setConfirmFinalize] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const [kind, setKind] = React.useState<"adhoc" | "discount">("adhoc");
  const [description, setDescription] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [unitAmount, setUnitAmount] = React.useState("");

  const [depositApplied, setDepositApplied] = React.useState(invoice.deposit_applied);
  const [depositInput, setDepositInput] = React.useState(String(invoice.deposit_applied));
  const [savingDeposit, startSavingDeposit] = React.useTransition();

  const totals = computeTotals(lines, invoice.tax_rate);
  // Clamped for display the same way the server clamps at finalize: removing
  // a line after the deposit was set can shrink the total below what was
  // applied, and this is recomputed from local totals on every edit, so
  // without the floor this would flash a negative "Amount due" until the
  // next server round-trip corrects it.
  const amountDue = Math.max(0, fromCents(toCents(totals.total) - toCents(depositApplied)));
  const apiBase = `/api/internal/invoices/${invoice.id}`;
  const meta = INVOICE_STATUS_META.draft;
  const entryCount = invoice.time_entries.length;
  const hoursWorked = invoice.time_entries.reduce((sum, e) => sum + e.hours_worked, 0);
  const canFinalize = lines.length > 0;
  // Deposit balance excludes nothing of this invoice's own current
  // deposit_applied when it computes `remaining` -- add it back to get the
  // ceiling this draft could still be set to, mirroring the PATCH route's
  // own `and id <> invoiceId` exclusion.
  const depositAvailable = depositBalance.remaining + depositApplied;
  const canApplyDeposit = depositAvailable > 0 || depositApplied > 0;

  async function addLine(event: React.FormEvent) {
    event.preventDefault();
    const qty = Number(quantity);
    const unit = Number(unitAmount);
    if (!description.trim() || !Number.isFinite(qty) || qty === 0 || !Number.isFinite(unit)) return;

    setAdding(true);
    const result = await run(
      api<LinesResponse>(`${apiBase}/lines`, {
        method: "POST",
        body: {
          kind,
          description: description.trim(),
          // A discount has to come off the total, so its quantity is negative
          // whichever way round the number was typed.
          quantity: kind === "discount" ? -Math.abs(qty) : qty,
          unit_amount: unit,
        },
      }),
      { error: "The line could not be added" },
    );
    setAdding(false);
    if (result) {
      setLines(result.lines);
      setDescription("");
      setQuantity("1");
      setUnitAmount("");
      router.refresh();
    }
  }

  async function removeLine(lineId: string) {
    setBusy(lineId);
    const result = await run(
      api<LinesResponse>(`${apiBase}/lines/${lineId}`, {
        method: "DELETE",
      }),
      { error: "The line could not be removed" },
    );
    setBusy(null);
    if (result) {
      setLines(result.lines);
      router.refresh();
    }
  }

  function addUnbilledCharges() {
    startAddingCharges(async () => {
      const result = await run(
        api<ChargesSweepResponse>(`${apiBase}/charges`, { method: "POST" }),
        { error: "Could not add the unbilled charges" },
      );
      if (result) {
        setLines(result.invoice.lines);
        router.refresh();
      }
    });
  }

  function finalize() {
    startFinalizing(async () => {
      const result = await run(
        api(`${apiBase}/finalize`, { method: "POST" }),
        { success: "Invoice finalized.", error: "The invoice could not be finalized" },
      );
      if (result) {
        setConfirmFinalize(false);
        router.refresh();
      }
    });
  }

  function deleteDraft() {
    startFinalizing(async () => {
      const ok = await run(
        api(apiBase, { method: "DELETE" }).then(() => true),
        { success: "Draft deleted.", error: "The draft could not be deleted" },
      );
      if (ok) {
        setConfirmDelete(false);
        router.push(`/app/projects/${invoice.project.slug}/invoices`);
        router.refresh();
      }
    });
  }

  // `depositBalance` is loaded by the page, so the refresh re-reads it.
  function saveDepositApplied() {
    const value = Number(depositInput);
    if (!Number.isFinite(value) || value < 0) return;
    startSavingDeposit(async () => {
      const result = await run(
        api<DepositPatchResponse>(`${apiBase}/deposit`, {
          method: "PATCH",
          body: { deposit_applied: value },
        }),
        { success: "Deposit applied updated.", error: "Could not update the applied deposit" },
      );
      if (result) {
        setDepositApplied(result.deposit_applied);
        setDepositInput(String(result.deposit_applied));
        router.refresh();
      }
    });
  }

  return (
    <>
      <PageHeader
        title="Draft invoice"
        eyebrow={
          <Link
            href={`/app/projects/${invoice.project.slug}/invoices`}
            className="truncate hover:text-[var(--text-secondary)]"
          >
            {invoice.project.name}
          </Link>
        }
        actions={
          <>
            <Badge tone={meta.tone} className="hidden sm:inline-flex">
              {meta.label}
            </Badge>
            <Button
              variant="danger-ghost"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete this draft"
            >
              <Trash2 />
              <span className="hidden sm:inline">Delete draft</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!canFinalize}
              title={canFinalize ? undefined : "Add at least one line first"}
              onClick={() => setConfirmFinalize(true)}
            >
              <Lock />
              Finalize
            </Button>
          </>
        }
      />

      <div className="mx-auto max-w-[76rem] px-4 py-6 md:px-6">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0 space-y-5">
            {/* Lines ---------------------------------------------------- */}
            <Card>
              <CardHeader
                title="Lines"
                description="Everything on this line table becomes the client's invoice. Add or remove until it is right."
              />
              {unbilledCharges.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--warning-subtle)] px-3 py-2 text-xs">
                  <p className="flex items-center gap-1.5 text-[var(--warning-text)]">
                    <Receipt className="size-3.5 shrink-0" />
                    {unbilledCharges.length} unbilled charge
                    {unbilledCharges.length === 1 ? "" : "s"}{" "}
                    {unbilledCharges.length === 1 ? "isn't" : "aren't"} on this invoice.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    disabled={addingCharges}
                    onClick={addUnbilledCharges}
                  >
                    {addingCharges && <Loader2 className="animate-spin" />}
                    Add them
                  </Button>
                </div>
              )}
              <Table label="Invoice lines" className="sm:min-w-[36rem]">
                <THead>
                  <tr>
                    <TH>Description</TH>
                    <TH numeric className="w-20">
                      Qty
                    </TH>
                    <TH numeric className="hidden w-28 sm:table-cell">
                      Rate
                    </TH>
                    <TH numeric className="w-28">
                      Amount
                    </TH>
                    <th scope="col" className="relative w-9">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </THead>
                <TBody>
                  {lines.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center text-sm text-[var(--text-tertiary)]"
                      >
                        No lines yet. Add one below — an invoice needs at least one before it can
                        be finalized.
                      </td>
                    </tr>
                  )}
                  {lines.map((line) => {
                    const credit = line.amount < 0;
                    return (
                      <tr key={line.id} className="group">
                        <td className="px-3 py-2 align-top">
                          <p
                            className={cn(
                              credit ? "text-[var(--danger-text)]" : "text-[var(--text-primary)]",
                            )}
                          >
                            {line.description}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <p className="text-2xs text-[var(--text-tertiary)]">
                              {LINE_KIND_LABEL[line.kind]}
                            </p>
                            {line.charge_id !== null && <Badge tone="neutral">Charge</Badge>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right align-top tabular-nums text-[var(--text-secondary)]">
                          {lineQuantityLabel(line)}
                        </td>
                        <td className="hidden px-3 py-2 text-right align-top tabular-nums text-[var(--text-secondary)] sm:table-cell">
                          {formatMoney(line.unit_amount, invoice.currency)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right align-top font-medium tabular-nums",
                            credit ? "text-[var(--danger-text)]" : "text-[var(--text-primary)]",
                          )}
                        >
                          {formatMoney(line.amount, invoice.currency)}
                        </td>
                        <td className="px-1 py-1.5 align-top">
                          <IconButton
                            label={`Remove ${line.description}`}
                            variant="ghost"
                            size="sm"
                            disabled={busy === line.id}
                            onClick={() => removeLine(line.id)}
                            className="text-[var(--text-tertiary)] opacity-0 transition-opacity hover:text-[var(--danger-text)] group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            {busy === line.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Trash2 />
                            )}
                          </IconButton>
                        </td>
                      </tr>
                    );
                  })}
                </TBody>
              </Table>

              {/* Add a line ------------------------------------------------ */}
              <form
                onSubmit={addLine}
                className="flex flex-wrap items-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-3 py-3"
              >
                <label className="flex-1 basis-full sm:basis-[16rem]">
                  <span className="sr-only">Line description</span>
                  <Input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Add a line — e.g. Domain renewal"
                    maxLength={500}
                    className="h-8"
                  />
                </label>
                <label>
                  <span className="sr-only">Line kind</span>
                  <NativeSelect
                    value={kind}
                    onChange={(event) => setKind(event.target.value as "adhoc" | "discount")}
                    className="h-8 w-[7rem]"
                  >
                    {ADDABLE_KINDS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label>
                  <span className="sr-only">Quantity</span>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    className="h-8 w-[4.5rem] text-right tabular-nums"
                    aria-label="Quantity"
                  />
                </label>
                <label>
                  <span className="sr-only">Unit amount</span>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={unitAmount}
                    onChange={(event) => setUnitAmount(event.target.value)}
                    placeholder="0.00"
                    className="h-8 w-[6.5rem] text-right tabular-nums"
                    aria-label="Unit amount"
                  />
                </label>
                <Button type="submit" variant="secondary" size="md" disabled={adding}>
                  {adding ? <Loader2 className="animate-spin" /> : <Plus />}
                  Add
                </Button>
                {kind === "discount" && (
                  <p className="basis-full text-2xs text-[var(--text-tertiary)]">
                    A discount is subtracted from the total; enter the amount to take off.
                  </p>
                )}
              </form>

              {/* Totals ---------------------------------------------------- */}
              <div className="flex justify-end border-t border-[var(--border-subtle)] px-3 py-3">
                <dl className="w-full max-w-xs space-y-1.5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--text-tertiary)]">Subtotal</dt>
                    <dd className="tabular-nums text-[var(--text-primary)]">
                      {formatMoney(totals.subtotal, invoice.currency)}
                    </dd>
                  </div>
                  {totals.taxable_subtotal !== totals.subtotal && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--text-tertiary)]">Taxable subtotal</dt>
                      <dd className="tabular-nums text-[var(--text-primary)]">
                        {formatMoney(totals.taxable_subtotal, invoice.currency)}
                      </dd>
                    </div>
                  )}
                  {invoice.tax_rate > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--text-tertiary)]">
                        Tax ({(invoice.tax_rate * 100).toFixed(
                          (invoice.tax_rate * 100) % 1 === 0 ? 0 : 2,
                        )}
                        %)
                      </dt>
                      <dd className="tabular-nums text-[var(--text-primary)]">
                        {formatMoney(totals.tax_amount, invoice.currency)}
                      </dd>
                    </div>
                  )}
                  {/* Draws down the project's deposit balance -- a column
                      against the invoice, never a line inside the subtotal
                      tax was computed on. */}
                  {canApplyDeposit && (
                    <div className="flex items-start justify-between gap-4">
                      <dt className="pt-1.5 text-[var(--text-tertiary)]">
                        <label htmlFor="deposit_applied">Deposit applied</label>
                      </dt>
                      <dd className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5">
                          <Input
                            id="deposit_applied"
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            min={0}
                            max={depositAvailable}
                            value={depositInput}
                            onChange={(event) => setDepositInput(event.target.value)}
                            className="h-7 w-[6rem] text-right tabular-nums"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="xs"
                            disabled={
                              savingDeposit ||
                              !Number.isFinite(Number(depositInput)) ||
                              Number(depositInput) === depositApplied
                            }
                            onClick={saveDepositApplied}
                          >
                            {savingDeposit && <Loader2 className="animate-spin" />}
                            Apply
                          </Button>
                        </div>
                        <span className="text-2xs tabular-nums text-[var(--text-tertiary)]">
                          {formatMoney(depositAvailable, invoice.currency)} available
                        </span>
                      </dd>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-4 border-t border-[var(--border-default)] pt-2">
                    <dt className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-primary)]">
                      Amount due {invoice.currency}
                    </dt>
                    <dd className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">
                      {formatMoney(amountDue, invoice.currency)}
                    </dd>
                  </div>
                </dl>
              </div>
            </Card>

            {/* Time in the period (server-rendered, passed through) -------- */}
            <Card>
              <CardHeader
                title="Time in this period"
                description="Finalizing locks these entries to the invoice and makes them read-only."
              />
              {children}
            </Card>
          </div>

          {/* Summary ------------------------------------------------------ */}
          <aside className="min-w-0 space-y-5">
            <Card className="p-4">
              <dl className="space-y-2.5 text-sm">
                <div>
                  <dt className="text-2xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                    Client
                  </dt>
                  <dd className="truncate text-[var(--text-primary)]">
                    {invoice.project.client_name}
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                    Period
                  </dt>
                  <dd className="tabular-nums text-[var(--text-primary)]">
                    {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                    Billing
                  </dt>
                  <dd className="text-[var(--text-primary)]">
                    {billingModelLabel(invoice.project.billing_model)} ·{" "}
                    {invoice.currency}
                    {invoice.tax_rate > 0 && ` · ${(invoice.tax_rate * 100).toFixed(0)}% tax`}
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                    Unbilled time
                  </dt>
                  <dd className="tabular-nums text-[var(--text-primary)]">
                    {entryCount} entr{entryCount === 1 ? "y" : "ies"} ·{" "}
                    {formatHours(hoursWorked)}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card className="border-[var(--warning-subtle)] bg-[var(--warning-subtle)] p-4">
              <p className="text-xs font-semibold text-[var(--warning-text)]">Not yet issued</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                A draft has no number and is invisible to the client. Finalizing is the point of no
                return — after it, corrections are made by voiding and reissuing.
              </p>
            </Card>

            <Button asChild variant="ghost" size="sm" className="w-full justify-start">
              <Link href="/app/invoices">
                <ArrowLeft />
                All invoices
              </Link>
            </Button>
          </aside>
        </div>
      </div>

      {/* Finalize confirmation ------------------------------------------- */}
      <Modal open={confirmFinalize} onOpenChange={setConfirmFinalize}>
        <ModalContent
          title="Finalize this invoice"
          description="Read this before you commit — it is the one step in Kraken that cannot be undone."
          footer={
            <>
              <ModalClose asChild>
                <Button variant="ghost" size="md">
                  Cancel
                </Button>
              </ModalClose>
              <Button variant="primary" size="md" onClick={finalize} disabled={finalizing}>
                {finalizing ? <Loader2 className="animate-spin" /> : <Lock />}
                Finalize invoice
              </Button>
            </>
          }
        >
          <ol className="my-2 space-y-3 text-sm text-[var(--text-secondary)]">
            <li className="flex gap-2.5">
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[var(--bg-inset)] text-2xs font-semibold text-[var(--text-secondary)]">
                1
              </span>
              <span>
                It is assigned the next permanent number in the{" "}
                <code className="rounded-[var(--radius-xs)] bg-[var(--bg-inset)] px-1 font-mono text-xs">
                  YYYY-NNN
                </code>{" "}
                sequence. That number is never reused — not even if this invoice is later voided.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[var(--bg-inset)] text-2xs font-semibold text-[var(--text-secondary)]">
                2
              </span>
              <span>
                The totals freeze at{" "}
                <strong className="font-medium tabular-nums text-[var(--text-primary)]">
                  {formatMoney(totals.total, invoice.currency)}
                </strong>
                . Lines can no longer be added, edited, or removed.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[var(--bg-inset)] text-2xs font-semibold text-[var(--text-secondary)]">
                3
              </span>
              <span>
                The{" "}
                <strong className="font-medium text-[var(--text-primary)]">
                  {entryCount} time entr{entryCount === 1 ? "y" : "ies"}
                </strong>{" "}
                between {formatDate(invoice.period_start)} and {formatDate(invoice.period_end)} lock
                to this invoice and become read-only.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[var(--bg-inset)] text-2xs font-semibold text-[var(--text-secondary)]">
                4
              </span>
              <span>
                The PDF is generated and the invoice moves to{" "}
                <strong className="font-medium text-[var(--text-primary)]">Sent</strong>. It is not
                shown to the client until you publish it to the portal, which is a separate step.
              </span>
            </li>
          </ol>
          <p className="mb-3 rounded-[var(--radius-md)] bg-[var(--danger-subtle)] px-3 py-2 text-xs leading-relaxed text-[var(--danger-text)]">
            This cannot be undone. A mistake on a finalized invoice is corrected by voiding it and
            issuing a replacement.
          </p>
        </ModalContent>
      </Modal>

      {/* Delete confirmation --------------------------------------------- */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this draft?"
        confirmLabel="Delete draft"
        cancelLabel="Keep it"
        icon={<Trash2 />}
        busy={finalizing}
        onConfirm={deleteDraft}
      >
        <p className="mb-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          No number has been assigned and nothing has been sent, so this draft can be removed
          cleanly. The {entryCount} time entr{entryCount === 1 ? "y" : "ies"} in the period stay
          unbilled and will be picked up by the next invoice.
        </p>
      </ConfirmDialog>
    </>
  );
}
