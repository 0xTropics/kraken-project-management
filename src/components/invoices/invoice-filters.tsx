"use client";

import * as React from "react";
import Form from "next/form";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/field";
import { CURRENCIES, INVOICE_STATUSES } from "@/lib/db/types";
import type { Currency, InvoiceStatus } from "@/lib/db/types";
import type { InvoiceFilterProject } from "@/lib/data/invoices";

export type StatusFilter = InvoiceStatus | "outstanding" | "";

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent — unpaid",
  paid: "Paid",
  void: "Void",
};

/**
 * URL-driven so a filtered view can be linked, bookmarked, and reloaded --
 * the dashboard's "unpaid invoices" tile points straight at
 * `?status=outstanding`. The current values arrive as props rather than from
 * `useSearchParams` so this never needs a Suspense boundary.
 */
export function InvoiceFilters({
  status,
  projectId,
  currency,
  projects,
}: {
  status: StatusFilter;
  projectId: string;
  currency: Currency | "";
  projects: InvoiceFilterProject[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const active = Boolean(status || projectId || currency);
  // A GET form: every select submits, so an "all" choice arrives as an empty
  // param, which the page reads as unset.
  const apply = (event: React.ChangeEvent<HTMLSelectElement>) =>
    event.currentTarget.form?.requestSubmit();

  return (
    <Form action="" scroll={false} className="flex flex-wrap items-center gap-2">
      <NativeSelect
        name="status"
        aria-label="Filter by status"
        value={status}
        onChange={apply}
        className="h-7 w-auto min-w-[9rem] rounded-[var(--radius-sm)] py-0 pl-2 pr-7 text-xs"
      >
        <option value="">All statuses</option>
        <option value="outstanding">Outstanding</option>
        {INVOICE_STATUSES.map((value) => (
          <option key={value} value={value}>
            {STATUS_LABELS[value]}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        name="project"
        aria-label="Filter by project"
        value={projectId}
        onChange={apply}
        className="h-7 w-auto min-w-[10rem] max-w-[16rem] rounded-[var(--radius-sm)] py-0 pl-2 pr-7 text-xs"
      >
        <option value="">All projects</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.client_name} — {project.name}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        name="currency"
        aria-label="Filter by currency"
        value={currency}
        onChange={apply}
        className="h-7 w-auto rounded-[var(--radius-sm)] py-0 pl-2 pr-7 text-xs"
      >
        <option value="">Any currency</option>
        {CURRENCIES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </NativeSelect>

      {active && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname, { scroll: false })}>
          <X />
          Clear
        </Button>
      )}
    </Form>
  );
}
