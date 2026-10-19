"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal, ModalClose, ModalContent } from "@/components/ui/modal";
import { api, run } from "@/lib/client-api";

/**
 * Raising an invoice asks for a period and nothing else.
 *
 * Everything else — the lines, the currency, the tax rate — is derived by the
 * engine from the project and the time already logged, so asking for it here
 * would be asking the user to restate facts the system knows. What comes back
 * is a draft, and the draft is where the decisions are made.
 */
export function NewInvoiceButton({
  projectId,
  defaultStart,
  defaultEnd,
  label = "New invoice",
  description,
}: {
  projectId: string;
  defaultStart: string;
  defaultEnd: string;
  label?: string;
  description?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [start, setStart] = React.useState(defaultStart);
  const [end, setEnd] = React.useState(defaultEnd);
  const [pending, startTransition] = React.useTransition();

  const invalid = Boolean(start && end && end < start);

  function create(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || !start || !end) return;
    startTransition(async () => {
      const result = await run(
        api<{ id: string }>("/api/internal/invoices", {
          method: "POST",
          body: { project_id: projectId, period_start: start, period_end: end },
        }),
        { error: "The draft could not be created" },
      );
      if (result) {
        setOpen(false);
        router.push(`/app/invoices/${result.id}`);
        router.refresh();
      }
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setStart(defaultStart);
          setEnd(defaultEnd);
        }
      }}
    >
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <ModalContent
        title="New invoice"
        description={
          description ??
          "Kraken pulls the period's unbilled time — or the month's retainer — into a draft you can edit before anything is issued."
        }
        size="sm"
        footer={
          <>
            <ModalClose asChild>
              <Button variant="ghost" size="md">
                Cancel
              </Button>
            </ModalClose>
            <Button
              variant="primary"
              size="md"
              onClick={create}
              disabled={pending || invalid || !start || !end}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Plus />}
              Create draft
            </Button>
          </>
        }
      >
        <form onSubmit={create} className="space-y-4 pb-2 pt-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Period start" htmlFor="period-start" required>
              <Input
                id="period-start"
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </Field>
            <Field
              label="Period end"
              htmlFor="period-end"
              required
              error={invalid ? "The period ends before it starts." : null}
            >
              <Input
                id="period-end"
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                aria-invalid={invalid}
                required
              />
            </Field>
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
            Defaults to last month. Only time that is not already on a finalized invoice is pulled
            in, so a period can safely overlap one you have billed before.
          </p>
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
            Create draft
          </button>
        </form>
      </ModalContent>
    </Modal>
  );
}
