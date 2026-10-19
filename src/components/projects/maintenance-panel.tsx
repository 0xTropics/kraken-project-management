"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Hammer, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Modal, ModalClose, ModalContent } from "@/components/ui/modal";
import { api, run } from "@/lib/client-api";
import type { BuildFeeProgress, MaintenanceStatus } from "@/lib/data/maintenance";
import type { Currency, DateString, MaintenanceTerm } from "@/lib/db/types";
import { formatDate, formatMoney, fromCents, toCents } from "@/lib/format";
import { termSpanLabel } from "@/lib/invoices/maintenance";

const LABEL = "text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]";

function termLabel(months: MaintenanceTerm): string {
  switch (months) {
    case 1:
      return "Monthly";
    case 6:
      return "6-month prepay";
    case 12:
      return "12-month prepay";
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd className="tabular-nums text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

/**
 * Where a build + maintenance project is billed: build-fee progress with
 * Bill installment, and maintenance coverage with Draft next term. Both
 * actions land on the new draft. Every figure is derived server-side from
 * charges and invoices; nothing here is stored.
 */
export function MaintenancePanel({
  projectId,
  currency,
  termMonths,
  startsOn,
  build,
  status,
}: {
  projectId: string;
  currency: Currency;
  termMonths: MaintenanceTerm;
  startsOn: DateString | null;
  build: BuildFeeProgress;
  status: MaintenanceStatus;
}) {
  const router = useRouter();
  const [drafting, startDrafting] = React.useTransition();

  function draftTerm() {
    startDrafting(async () => {
      const invoice = await run(
        api<{ id: string }>(`/api/internal/projects/${projectId}/maintenance-draft`, { method: "POST" }),
        { error: "Could not draft the next term" },
      );
      if (invoice) {
        router.push(`/app/invoices/${invoice.id}`);
        router.refresh();
      }
    });
  }

  const coverage = status.covered_through
    ? status.has_gap && status.next_term
      ? `Covered through ${formatDate(status.covered_through)}, except ${termSpanLabel(status.next_term)} — not invoiced`
      : `Covered through ${formatDate(status.covered_through)}`
    : startsOn
      ? `Starts ${formatDate(startsOn)} · nothing invoiced yet`
      : "Not started — set the month maintenance starts in Settings.";

  return (
    <section aria-labelledby="maintenance-heading" className="space-y-3">
      <SectionTitle>
        <span id="maintenance-heading">Build &amp; maintenance</span>
      </SectionTitle>
      <div className="grid gap-px grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--border-subtle)] md:grid-cols-2">
        <BuildFeeBlock projectId={projectId} currency={currency} build={build} />
        <div className="space-y-3 bg-[var(--bg-panel)] p-4">
          <p className={LABEL}>Maintenance</p>
          <p className="text-base font-medium tabular-nums text-[var(--text-primary)]">
            {termLabel(termMonths)} · {formatMoney(status.term_price, currency)}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">{coverage}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={draftTerm}
            disabled={drafting || status.next_term === null}
          >
            {drafting ? <Loader2 className="animate-spin" /> : <CalendarRange />}
            {status.next_term ? `Draft ${termSpanLabel(status.next_term)}` : "Draft next term"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function BuildFeeBlock({
  projectId,
  currency,
  build,
}: {
  projectId: string;
  currency: Currency;
  build: BuildFeeProgress;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [pending, startPending] = React.useTransition();

  if (build.build_fee === null || build.left === null) {
    return (
      <div className="space-y-2 bg-[var(--bg-panel)] p-4">
        <p className={LABEL}>Build fee</p>
        <p className="text-xs text-[var(--text-secondary)]">
          No build fee on this project. Set one in Settings to bill it in installments.
        </p>
      </div>
    );
  }

  const left = build.left;
  const notYetInvoiced = fromCents(toCents(build.recorded) - toCents(build.invoiced));
  const parsed = Number(amount);
  const overLeft = amount !== "" && toCents(parsed) > toCents(left);
  const invalid = !(parsed > 0) || overLeft || description.trim() === "";

  function create(event?: React.FormEvent) {
    event?.preventDefault();
    if (invalid) return;
    startPending(async () => {
      const invoice = await run(
        api<{ id: string }>(`/api/internal/projects/${projectId}/build-installments`, {
          method: "POST",
          body: { amount: parsed, description: description.trim() },
        }),
        { error: "Could not bill that installment" },
      );
      if (invoice) {
        setOpen(false);
        router.push(`/app/invoices/${invoice.id}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3 bg-[var(--bg-panel)] p-4">
      <p className={LABEL}>Build fee</p>
      <p className="text-base font-medium tabular-nums text-[var(--text-primary)]">
        {formatMoney(build.build_fee, currency)}
      </p>
      <dl className="space-y-1 text-xs">
        <Row label="Invoiced" value={formatMoney(build.invoiced, currency)} />
        <Row label="On a draft or not yet invoiced" value={formatMoney(notYetInvoiced, currency)} />
        <Row label="Left to bill" value={formatMoney(left, currency)} />
      </dl>
      {/* The prefill happens on the button, not in onOpenChange: Radix only
          calls onOpenChange for changes it makes itself (Escape, the close
          button), never for `open` set from outside. */}
      <Modal open={open} onOpenChange={setOpen}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setAmount(String(left));
            setDescription("");
            setOpen(true);
          }}
          disabled={left <= 0}
        >
          <Hammer />
          {left <= 0 ? "Fully billed" : "Bill installment"}
        </Button>
        <ModalContent
          title="Bill a build installment"
          description={`Records the installment and drafts its invoice. ${formatMoney(left, currency)} of the build fee is left to bill.`}
          size="sm"
          footer={
            <>
              <ModalClose asChild>
                <Button variant="ghost" size="md">
                  Cancel
                </Button>
              </ModalClose>
              <Button variant="primary" size="md" onClick={() => create()} disabled={pending || invalid}>
                {pending ? <Loader2 className="animate-spin" /> : <Plus />}
                Create draft
              </Button>
            </>
          }
        >
          <form onSubmit={create} className="space-y-4 pb-2 pt-1">
            <Field
              label="Amount"
              htmlFor="installment-amount"
              required
              error={overLeft ? `Only ${formatMoney(left, currency)} is left to bill.` : null}
            >
              <Input
                id="installment-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                required
                aria-invalid={overLeft ? true : undefined}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>
            <Field
              label="Description"
              htmlFor="installment-description"
              required
              hint="What the client reads on the invoice."
            >
              <Input
                id="installment-description"
                value={description}
                maxLength={200}
                placeholder="50% on signing"
                required
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
              Create draft
            </button>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
