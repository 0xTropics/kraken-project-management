"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, run } from "@/lib/client-api";
import type { RetainerRunPreview } from "@/lib/data/dashboard";

interface RunResult {
  created: { project: string; invoice_id: string }[];
  skipped: { project: string; reason: string }[];
}

/**
 * One click drafts this month's retainer and monthly maintenance invoices.
 * Idempotent, so a second click is safe and says so. Prepaid maintenance terms
 * are never drafted here -- they appear under Renewals due.
 */
export function RetainerRunButton({ preview }: { preview: RetainerRunPreview }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  if (preview.eligible === 0) {
    return (
      <p className="text-xs text-[var(--text-tertiary)]">
        {preview.already_invoiced === 1
          ? "Monthly invoice already drafted this month."
          : preview.already_invoiced > 1
            ? `All ${preview.already_invoiced} monthly invoices drafted this month.`
            : "Nothing billed monthly."}
      </p>
    );
  }

  function onClick() {
    startTransition(async () => {
      const result = await run(
        api<RunResult>("/api/internal/invoices/retainer-run", { method: "POST" }),
        { error: "Could not create the monthly invoices" },
      );
      if (result) {
        toast.success(
          result.created.length === 1
            ? `Drafted 1 monthly invoice.`
            : `Drafted ${result.created.length} monthly invoices.`,
          result.skipped.length
            ? { description: `${result.skipped.length} already covered this period.` }
            : undefined,
        );
        router.refresh();
      }
    });
  }

  return (
    <Button variant="secondary" size="sm" onClick={onClick} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Receipt />}
      Draft {preview.eligible} monthly invoice{preview.eligible === 1 ? "" : "s"}
    </Button>
  );
}
