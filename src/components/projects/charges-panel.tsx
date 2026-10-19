"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Plus, Receipt, Trash2 } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, NativeSelect } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/toggles";
import { Tooltip } from "@/components/ui/tooltip";
import { ApiRequestError, api, run } from "@/lib/client-api";
import { formatDate, formatMoney, today } from "@/lib/format";
import { CHARGE_KINDS, type ChargeKind, type Currency } from "@/lib/db/types";
import type { ChargeWithState } from "@/lib/data/charges";

const KIND_META: Record<ChargeKind, { label: string; tone: Tone }> = {
  expense: { label: "Expense", tone: "neutral" },
  fixed: { label: "Fixed price", tone: "accent" },
  commission: { label: "Commission", tone: "info" },
  build: { label: "Build installment", tone: "accent" },
};

interface ChargesResponse {
  charges: ChargeWithState[];
}

function blankForm() {
  return {
    kind: "expense" as ChargeKind,
    description: "",
    amount: "",
    incurred_on: today(),
    taxable: true,
    note: "",
  };
}

/**
 * Money owed that did not come from the clock: a pass-through cost paid on the
 * client's behalf, a fixed-price item, or a commission. Sits beside Deposits
 * on the settings page.
 *
 * Every mutation returns the whole `charges` array already joined against its
 * billed state, so this panel replaces local state wholesale on each response
 * rather than patching one row -- the displayed list and the stored one cannot
 * drift, because the stored one always wins (draft-editor.tsx documents the
 * same reasoning for invoice lines). `router.refresh()` follows so the rest of
 * this server-rendered page -- and the invoice draft's late-charge prompt --
 * see the change too.
 */
export function ChargesPanel({
  projectId,
  currency,
  charges: initialCharges,
}: {
  projectId: string;
  currency: Currency;
  charges: ChargeWithState[];
}) {
  const router = useRouter();
  const [charges, setCharges] = React.useState(initialCharges);
  const [form, setForm] = React.useState(blankForm);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [recording, startRecording] = React.useTransition();
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<ChargeWithState | null>(null);
  const [invalidField, setInvalidField] = React.useState<"description" | "amount" | null>(null);

  const apiBase = `/api/internal/projects/${projectId}/charges`;

  function record(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.description.trim()) {
      setInvalidField("description");
      setFormError("Enter a description");
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setInvalidField("amount");
      setFormError("Enter an amount greater than zero");
      return;
    }
    setInvalidField(null);
    setFormError(null);
    startRecording(async () => {
      try {
        const result = await api<ChargesResponse>(apiBase, {
          method: "POST",
          body: {
            kind: form.kind,
            description: form.description.trim(),
            amount,
            taxable: form.taxable,
            incurred_on: form.incurred_on,
            note: form.note.trim() || undefined,
          },
        });
        setCharges(result.charges);
        setForm(blankForm());
        router.refresh();
      } catch (caught) {
        setFormError(
          caught instanceof ApiRequestError
            ? (caught.body.issues?.[0]?.message ?? caught.message)
            : "Could not record that charge",
        );
      }
    });
  }

  async function remove() {
    if (!confirmDelete) return;
    setRemoving(confirmDelete.id);
    const result = await run(
      api<ChargesResponse>(`${apiBase}/${confirmDelete.id}`, { method: "DELETE" }),
      {
        success: confirmDelete.has_any_line ? "Charge withdrawn." : "Charge removed.",
        error: "Could not remove that charge",
      },
    );
    setRemoving(null);
    if (result) {
      setCharges(result.charges);
      setConfirmDelete(null);
      router.refresh();
    }
  }

  return (
    <section aria-labelledby="charges-heading" className="space-y-4">
      <SectionTitle>
        <span id="charges-heading" className="flex items-center gap-1.5">
          <Receipt className="size-3.5" />
          Charges
        </span>
      </SectionTitle>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
        {charges.length === 0 ? (
          <EmptyState
            compact
            icon={Receipt}
            title="No charges yet"
            description="Record a pass-through cost, a fixed-price item, or a commission — it rolls onto the next invoice draft for this project."
          />
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {charges.map((charge) => {
              // `invoice_number` alone is not the right billed/unbilled signal: a
              // charge swept onto a still-draft invoice has a non-null invoice_id
              // but a null number (drafts have no number until finalized, see
              // invoices_number_presence). `invoice_id` is null once every
              // referencing invoice is void, which is also when the charge
              // re-sweeps onto the next draft -- so it is the right "is this
              // currently billed" signal.
              //
              // It is NOT the right "can this be deleted" signal: the FK
              // (`on delete restrict`) blocks deletion on ANY referencing line,
              // void included. A charge whose only invoice was voided is
              // unbilled (`invoice_id` null) but still permanently undeletable,
              // so that state needs its own badge rather than falling into
              // "Unbilled" with a delete button that would 409 every time.
              const cancelled = charge.cancelled_at !== null;
              const billed = !cancelled && charge.invoice_id !== null;
              // Only voided invoices reference it: it cannot be deleted, but it
              // can be withdrawn so it stops sweeping onto drafts.
              const voidOnly = !cancelled && !billed && charge.has_any_line;
              return (
                <li key={charge.id} className="group flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={KIND_META[charge.kind].tone}>{KIND_META[charge.kind].label}</Badge>
                      <p className="truncate text-base font-medium text-[var(--text-primary)]">
                        {charge.description}
                      </p>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-2xs text-[var(--text-tertiary)]">
                      <span className="tabular-nums">{formatDate(charge.incurred_on)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums font-medium text-[var(--text-secondary)]">
                        {formatMoney(charge.amount, currency)}
                      </span>
                      {!charge.taxable && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>No tax</span>
                        </>
                      )}
                    </p>
                    {charge.note && (
                      <p className="mt-1 max-w-prose text-xs leading-relaxed text-[var(--text-secondary)]">
                        {charge.note}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {cancelled ? (
                      <Tooltip content="Withdrawn. It stays on the voided invoice but is never billed again.">
                        <Badge tone="neutral" className="cursor-help">
                          Withdrawn
                        </Badge>
                      </Tooltip>
                    ) : billed ? (
                      <Tooltip
                        content={
                          charge.invoice_number
                            ? `Billed on invoice ${charge.invoice_number}. Void the invoice, or remove its line from the draft, to unbill this charge.`
                            : "On a draft invoice. Remove its line from the draft to unbill this charge."
                        }
                      >
                        <Badge tone={charge.invoice_number ? "info" : "neutral"} className="cursor-help">
                          <Lock />
                          {charge.invoice_number ?? "Draft"}
                        </Badge>
                      </Tooltip>
                    ) : voidOnly ? (
                      <>
                        <Tooltip
                          content={
                            charge.voided_invoice_number
                              ? `Billed on invoice ${charge.voided_invoice_number}, which is void. It will be swept onto the next draft unless you withdraw it.`
                              : "Billed on an invoice that is now void. It will be swept onto the next draft unless you withdraw it."
                          }
                        >
                          <Badge tone="warning" className="cursor-help">
                            <Lock />
                            Void
                          </Badge>
                        </Tooltip>
                        <IconButton
                          label={`Withdraw the ${formatMoney(charge.amount, currency)} charge "${charge.description}"`}
                          variant="ghost"
                          size="sm"
                          disabled={removing === charge.id}
                          onClick={() => setConfirmDelete(charge)}
                          className="text-[var(--text-tertiary)] opacity-0 transition-opacity hover:text-[var(--danger-text)] group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          {removing === charge.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <Badge tone="neutral">Unbilled</Badge>
                        <IconButton
                          label={`Delete the ${formatMoney(charge.amount, currency)} charge "${charge.description}"`}
                          variant="ghost"
                          size="sm"
                          disabled={removing === charge.id}
                          onClick={() => setConfirmDelete(charge)}
                          className="text-[var(--text-tertiary)] opacity-0 transition-opacity hover:text-[var(--danger-text)] group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          {removing === charge.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                        </IconButton>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Record a new charge --------------------------------------------- */}
        <form
          onSubmit={record}
          className="flex flex-wrap items-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-3 py-3"
        >
          <label className="w-full">
            <span className="sr-only">Description</span>
            <Input
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Shipping cost, domain renewal, referral commission…"
              required
              maxLength={500}
              className="h-8"
              aria-label="Description"
              aria-invalid={invalidField === "description" ? true : undefined}
            />
          </label>
          <label className="w-[7.5rem]">
            <span className="sr-only">Amount</span>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              min={0}
              placeholder="0.00"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              className="h-8 text-right tabular-nums"
              aria-label="Amount"
              aria-invalid={invalidField === "amount" ? true : undefined}
            />
          </label>
          <label className="w-[9.5rem]">
            <span className="sr-only">Kind</span>
            <NativeSelect
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value as ChargeKind })}
              className="h-8"
              aria-label="Kind"
            >
              {/* No `build`: an installment is recorded only through Bill
                  installment on the Invoices tab, which checks the build fee cap
                  under the project lock. */}
              {CHARGE_KINDS.filter((kind) => kind !== "build").map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_META[kind].label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            <span className="sr-only">Incurred on</span>
            <Input
              type="date"
              value={form.incurred_on}
              onChange={(event) => setForm({ ...form, incurred_on: event.target.value })}
              className="h-8"
              aria-label="Incurred on"
            />
          </label>
          <label className="flex h-8 items-center gap-1.5 px-1">
            <Checkbox
              checked={form.taxable}
              onCheckedChange={(checked) => setForm({ ...form, taxable: checked === true })}
            />
            <span className="text-xs text-[var(--text-secondary)]">Taxable</span>
          </label>
          <label className="min-w-[10rem] flex-1 basis-full sm:basis-auto">
            <span className="sr-only">Note</span>
            <Input
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              placeholder="Note (optional)"
              maxLength={500}
              className="h-8"
            />
          </label>
          <Button type="submit" variant="secondary" size="md" disabled={recording}>
            {recording ? <Loader2 className="animate-spin" /> : <Plus />}
            Record
          </Button>
          {formError && <p className="basis-full text-xs text-[var(--danger)]">{formError}</p>}
        </form>
      </div>

      {/* Remove confirmation ------------------------------------------------ */}
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={confirmDelete?.has_any_line ? "Withdraw this charge?" : "Remove this charge?"}
        description={
          confirmDelete
            ? confirmDelete.has_any_line
              ? `The ${formatMoney(confirmDelete.amount, currency)} charge "${confirmDelete.description}" stays on its voided invoice but will not be billed again.`
              : `The ${formatMoney(confirmDelete.amount, currency)} charge "${confirmDelete.description}" will be removed.`
            : undefined
        }
        confirmLabel={confirmDelete?.has_any_line ? "Withdraw charge" : "Remove charge"}
        busy={removing !== null}
        onConfirm={remove}
      >
        <p className="pb-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          This cannot be undone.
        </p>
      </ConfirmDialog>
    </section>
  );
}
