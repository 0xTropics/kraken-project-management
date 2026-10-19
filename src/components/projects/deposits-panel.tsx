"use client";

import * as React from "react";
import { Loader2, PiggyBank, Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/toggles";
import { ApiRequestError, api, run } from "@/lib/client-api";
import { formatDate, formatMoney, today } from "@/lib/format";
import { PAYMENT_METHODS, type Currency, type PaymentMethod, type ProjectDeposit } from "@/lib/db/types";
import type { DepositBalance } from "@/lib/data/deposits";

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  crypto: "Crypto",
  etransfer: "E-transfer",
};

interface RecordResponse {
  deposit: ProjectDeposit;
  balance: DepositBalance;
}

interface DeleteResponse {
  deleted: string;
  balance: DepositBalance;
}

function blankForm() {
  return { amount: "", received_on: today(), method: "etransfer" as PaymentMethod, note: "" };
}

/**
 * Money held against a project ahead of an invoice.
 *
 * The balance shown here is never stored -- it is exactly what each mutation's
 * response reports, so this panel never has to recompute it and cannot drift
 * from what the server just did.
 */
export function DepositsPanel({
  projectId,
  currency,
  deposits: initialDeposits,
  balance: initialBalance,
}: {
  projectId: string;
  currency: Currency;
  deposits: ProjectDeposit[];
  balance: DepositBalance;
}) {
  const [deposits, setDeposits] = React.useState(initialDeposits);
  const [balance, setBalance] = React.useState(initialBalance);
  const [form, setForm] = React.useState(blankForm);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [recording, startRecording] = React.useTransition();
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<ProjectDeposit | null>(null);

  const apiBase = `/api/internal/projects/${projectId}/deposits`;

  function upsertDeposit(deposit: ProjectDeposit) {
    setDeposits((current) =>
      [...current.filter((row) => row.id !== deposit.id), deposit].sort((a, b) => {
        if (a.received_on !== b.received_on) return a.received_on < b.received_on ? 1 : -1;
        return a.created_at < b.created_at ? 1 : -1;
      }),
    );
  }

  function record(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter an amount greater than zero");
      return;
    }
    setFormError(null);
    startRecording(async () => {
      try {
        const result = await api<RecordResponse>(apiBase, {
          method: "POST",
          body: {
            amount,
            received_on: form.received_on,
            method: form.method,
            note: form.note.trim() || undefined,
          },
        });
        upsertDeposit(result.deposit);
        setBalance(result.balance);
        setForm(blankForm());
      } catch (caught) {
        setFormError(
          caught instanceof ApiRequestError
            ? (caught.body.issues?.[0]?.message ?? caught.message)
            : "Could not record that deposit",
        );
      }
    });
  }

  async function remove() {
    if (!confirmDelete) return;
    setRemoving(confirmDelete.id);
    const result = await run(
      api<DeleteResponse>(`${apiBase}/${confirmDelete.id}`, { method: "DELETE" }),
      { success: "Deposit removed.", error: "Could not remove that deposit" },
    );
    setRemoving(null);
    if (result) {
      setDeposits((current) => current.filter((row) => row.id !== result.deleted));
      setBalance(result.balance);
      setConfirmDelete(null);
    }
  }

  return (
    <section aria-labelledby="deposits-heading" className="space-y-4">
      <SectionTitle>
        <span id="deposits-heading" className="flex items-center gap-1.5">
          <PiggyBank className="size-3.5" />
          Deposits
        </span>
      </SectionTitle>

      {/* Three-number summary --------------------------------------------- */}
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ["Received", balance.received],
            ["Applied", balance.applied],
            ["Remaining", balance.remaining],
          ] as const
        ).map(([label, amount]) => (
          <div key={label} className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3">
            <p className="text-2xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]">
              {formatMoney(amount, currency)}
            </p>
          </div>
        ))}
      </div>

      {/* Recorded deposits -------------------------------------------------- */}
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
        {deposits.length === 0 ? (
          <EmptyState
            compact
            icon={PiggyBank}
            title="No deposits yet"
            description="Record what the client has paid up front — it applies to invoices for this project until it runs out."
          />
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {deposits.map((deposit) => (
              <li key={deposit.id} className="group flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="tabular-nums text-base font-medium text-[var(--text-primary)]">
                    {formatMoney(deposit.amount, currency)}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-2xs text-[var(--text-tertiary)]">
                    <span className="tabular-nums">{formatDate(deposit.received_on)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{METHOD_LABELS[deposit.method]}</span>
                  </p>
                  {deposit.note && (
                    <p className="mt-1 max-w-prose text-xs leading-relaxed text-[var(--text-secondary)]">
                      {deposit.note}
                    </p>
                  )}
                </div>
                <IconButton
                  label={`Remove the ${formatMoney(deposit.amount, currency)} deposit received ${formatDate(deposit.received_on)}`}
                  variant="ghost"
                  size="sm"
                  disabled={removing === deposit.id}
                  onClick={() => setConfirmDelete(deposit)}
                  className="shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity hover:text-[var(--danger-text)] group-hover:opacity-100 focus-visible:opacity-100"
                >
                  {removing === deposit.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        {/* Record a new deposit ------------------------------------------- */}
        <form
          onSubmit={record}
          className="flex flex-wrap items-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-3 py-3"
        >
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
              aria-invalid={formError ? true : undefined}
            />
          </label>
          <label>
            <span className="sr-only">Date received</span>
            <Input
              type="date"
              value={form.received_on}
              onChange={(event) => setForm({ ...form, received_on: event.target.value })}
              className="h-8"
              aria-label="Date received"
            />
          </label>
          <Segmented
            label="Payment method"
            size="sm"
            value={form.method}
            onChange={(value) => setForm({ ...form, method: value })}
            options={PAYMENT_METHODS.map((value) => ({ value, label: METHOD_LABELS[value] }))}
          />
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
        title="Remove this deposit?"
        description={
          confirmDelete
            ? `The ${formatMoney(confirmDelete.amount, currency)} deposit received ${formatDate(confirmDelete.received_on)} will no longer count toward the balance.`
            : undefined
        }
        confirmLabel="Remove deposit"
        busy={removing !== null}
        onConfirm={remove}
      >
        <p className="pb-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          This is refused if it would leave the project owing a balance it never received.
        </p>
      </ConfirmDialog>
    </section>
  );
}
