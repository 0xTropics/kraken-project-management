"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { api, run } from "@/lib/client-api";
import type { RenewalDue } from "@/lib/data/maintenance";
import type { DateString } from "@/lib/db/types";
import { coverageSummary } from "@/lib/invoices/maintenance";

/**
 * Prepaid maintenance terms that have ended or end within 30 days. Kraken
 * never drafts these on its own: a renewal waits for the client to confirm,
 * then Draft renewal bills the next term at the project's current term.
 */
export function RenewalsDue({ renewals, today }: { renewals: RenewalDue[]; today: DateString }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);

  if (renewals.length === 0) return null;

  async function draft(projectId: string) {
    setPending(projectId);
    const invoice = await run(
      api<{ id: string }>(`/api/internal/projects/${projectId}/maintenance-draft`, { method: "POST" }),
      { error: "Could not draft the renewal" },
    );
    setPending(null);
    if (invoice) {
      router.push(`/app/invoices/${invoice.id}`);
      router.refresh();
    }
  }

  return (
    <section aria-labelledby="renewals-heading" className="space-y-3">
      <SectionTitle count={renewals.length}>
        <span id="renewals-heading">Renewals due</span>
      </SectionTitle>
      <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
        {renewals.map((renewal) => (
          <li key={renewal.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <Link
                href={`/app/projects/${renewal.slug}/invoices`}
                className="block truncate text-base font-medium text-[var(--text-primary)] hover:underline"
              >
                {renewal.name}
              </Link>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                {renewal.client_name} · {renewal.term_months}-month prepay ·{" "}
                {coverageSummary(renewal.covered_through, renewal.next_start, today)}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => draft(renewal.id)}
              disabled={pending !== null}
            >
              {pending === renewal.id ? <Loader2 className="animate-spin" /> : <CalendarClock />}
              Draft renewal
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
