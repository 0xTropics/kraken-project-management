"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, BadgeCheck, Download, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Modal, ModalClose, ModalContent } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/toggles";
import { api, run } from "@/lib/client-api";
import { formatDate, formatMoney } from "@/lib/format";
import { PAYMENT_METHODS, type Currency, type InvoiceStatus, type PaymentMethod } from "@/lib/db/types";

/**
 * Everything you can still do to an invoice once it is finalized.
 *
 * Nothing here edits the document: the four remaining verbs are all lifecycle
 * moves. Both destructive ones — void, and marking money received — are behind
 * a dialog that says what the move actually does to the record.
 */

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  crypto: "Crypto",
  etransfer: "E-transfer",
};

export function InvoiceActions({
  invoiceId,
  number,
  status,
  published,
  currency,
  total,
  periodStart,
  periodEnd,
  timeEntryCount,
}: {
  invoiceId: string;
  number: string | null;
  status: InvoiceStatus;
  published: boolean;
  currency: Currency;
  total: number;
  periodStart: string;
  periodEnd: string;
  timeEntryCount: number;
}) {
  const router = useRouter();
  const apiBase = `/api/internal/invoices/${invoiceId}`;
  const [pending, setPending] = React.useState<string | null>(null);
  const [payOpen, setPayOpen] = React.useState(false);
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [method, setMethod] = React.useState<PaymentMethod>("etransfer");
  const [note, setNote] = React.useState("");

  const isVoid = status === "void";

  async function togglePublished() {
    setPending("publish");
    const result = await run(
      api(`${apiBase}/publish`, { method: "POST", body: { published: !published } }),
      {
        success: published ? "Removed from the portal." : "Published to the portal.",
        error: "The portal visibility could not be changed",
      },
    );
    setPending(null);
    if (result) router.refresh();
  }

  async function markPaid() {
    setPending("paid");
    const result = await run(
      api(`${apiBase}/mark-paid`, {
        method: "POST",
        body: { payment_method: method, payment_note: note.trim() || undefined },
      }),
      { success: "Marked paid.", error: "The invoice could not be marked paid" },
    );
    setPending(null);
    if (result) {
      setPayOpen(false);
      setNote("");
      router.refresh();
    }
  }

  async function voidInvoice() {
    setPending("void");
    const result = await run(api(`${apiBase}/void`, { method: "POST" }), {
      success: "Invoice voided.",
      error: "The invoice could not be voided",
    });
    setPending(null);
    if (result) {
      setVoidOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm">
        <a
          href={`${apiBase}/pdf`}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Download the PDF"
        >
          <Download />
          <span className="hidden sm:inline">PDF</span>
        </a>
      </Button>

      {!isVoid && (
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={togglePublished}
            disabled={pending === "publish"}
            aria-label={published ? "Unpublish from the client portal" : "Publish to the client portal"}
          >
            {pending === "publish" ? (
              <Loader2 className="animate-spin" />
            ) : published ? (
              <EyeOff />
            ) : (
              <Eye />
            )}
            <span className="hidden sm:inline">{published ? "Unpublish" : "Publish"}</span>
          </Button>

          <Button
            variant="danger-ghost"
            size="sm"
            onClick={() => setVoidOpen(true)}
            aria-label="Void this invoice"
          >
            <Ban />
            <span className="hidden md:inline">Void</span>
          </Button>

          {status === "sent" && (
            <Button variant="primary" size="sm" onClick={() => setPayOpen(true)}>
              <BadgeCheck />
              Mark paid
            </Button>
          )}
        </>
      )}

      {/* Mark paid ------------------------------------------------------- */}
      <Modal open={payOpen} onOpenChange={setPayOpen}>
        <ModalContent
          title={`Record payment for ${number ?? "this invoice"}`}
          description={`${formatMoney(total, currency)} received. How it arrived is kept on the record for reconciliation.`}
          footer={
            <>
              <ModalClose asChild>
                <Button variant="ghost" size="md">
                  Cancel
                </Button>
              </ModalClose>
              <Button variant="primary" size="md" onClick={markPaid} disabled={pending === "paid"}>
                {pending === "paid" ? <Loader2 className="animate-spin" /> : <BadgeCheck />}
                Mark paid
              </Button>
            </>
          }
        >
          <div className="space-y-4 pb-2 pt-1">
            <Field label="Payment method" required>
              <Segmented
                label="Payment method"
                size="md"
                value={method}
                onChange={setMethod}
                options={PAYMENT_METHODS.map((value) => ({
                  value,
                  label: METHOD_LABELS[value],
                }))}
              />
            </Field>
            <Field
              label="Note"
              htmlFor="payment-note"
              hint="Optional — a transaction hash, a cheque number, or when it cleared."
            >
              <Textarea
                id="payment-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="USDC on Base — 0x9f2c…4ae1"
              />
            </Field>
          </div>
        </ModalContent>
      </Modal>

      {/* Void ------------------------------------------------------------ */}
      <Modal open={voidOpen} onOpenChange={setVoidOpen}>
        <ModalContent
          title={`Void ${number ?? "this invoice"}?`}
          description="Voiding is how a finalized invoice is corrected. The invoice itself stays on the record forever."
          footer={
            <>
              <ModalClose asChild>
                <Button variant="ghost" size="md">
                  Cancel
                </Button>
              </ModalClose>
              <Button variant="danger" size="md" onClick={voidInvoice} disabled={pending === "void"}>
                {pending === "void" ? <Loader2 className="animate-spin" /> : <Ban />}
                Void invoice
              </Button>
            </>
          }
        >
          <ul className="my-2 space-y-2.5 text-sm text-[var(--text-secondary)]">
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-[var(--text-tertiary)]">
                •
              </span>
              <span>
                The{" "}
                <strong className="font-medium text-[var(--text-primary)]">
                  {timeEntryCount} time entr{timeEntryCount === 1 ? "y" : "ies"}
                </strong>{" "}
                between {formatDate(periodStart)} and {formatDate(periodEnd)} are released — they
                become editable again and will be picked up by the next invoice for the period.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-[var(--text-tertiary)]">
                •
              </span>
              <span>
                It is removed from the client portal immediately, whether or not it was published.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-[var(--text-tertiary)]">
                •
              </span>
              <span>
                The number{" "}
                <strong className="font-medium tabular-nums text-[var(--text-primary)]">
                  {number ?? "—"}
                </strong>{" "}
                is retired. It is never reused, and the next invoice takes the following number, so
                the sequence stays auditable with a visible gap.
              </span>
            </li>
          </ul>
          <p className="mb-3 rounded-[var(--radius-md)] bg-[var(--danger-subtle)] px-3 py-2 text-xs leading-relaxed text-[var(--danger-text)]">
            Void is terminal — a voided invoice can never be reopened, paid, or published. Issue a
            replacement from the project&rsquo;s Invoices tab.
          </p>
        </ModalContent>
      </Modal>
    </>
  );
}
