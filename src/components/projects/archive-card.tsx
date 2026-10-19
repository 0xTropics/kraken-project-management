"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/modal";
import { api, run } from "@/lib/client-api";

/**
 * Archiving is a soft delete: invoices and time entries keep their references,
 * the project leaves every list, and the portal stops answering for its slug.
 */
export function ArchiveCard({
  projectId,
  projectName,
  archived,
}: {
  projectId: string;
  projectName: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, startBusy] = React.useTransition();

  function archive() {
    startBusy(async () => {
      const result = await run(api(`/api/internal/projects/${projectId}`, { method: "DELETE" }), {
        success: "Project archived. Its portal is now closed.",
        error: "Could not archive that project",
      });
      if (result !== null) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  function restore() {
    startBusy(async () => {
      const result = await run(
        api(`/api/internal/projects/${projectId}`, { method: "PATCH", body: { status: "active" } }),
        { success: "Project restored. The portal is open again.", error: "Could not restore that project" },
      );
      if (result !== null) router.refresh();
    });
  }

  return (
    <section aria-labelledby="archive-heading" className="space-y-4">
      <SectionTitle>
        <span id="archive-heading">{archived ? "Archived" : "Danger zone"}</span>
      </SectionTitle>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--danger-subtle)] bg-[var(--danger-subtle)]/40 p-4">
        <div className="min-w-0">
          <p className="text-base font-medium text-[var(--text-primary)]">
            {archived ? "This project is archived" : "Archive this project"}
          </p>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-[var(--text-tertiary)]">
            {archived
              ? "It is hidden from the sidebar and every list, and its portal returns nothing. Restoring puts it back exactly as it was."
              : "Nothing is deleted — invoices, time entries and notes all stay. The project leaves the sidebar and every list, and its client portal stops answering."}
          </p>
        </div>
        {archived ? (
          <Button variant="secondary" size="md" className="shrink-0" disabled={busy} onClick={restore}>
            {busy ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}
            Restore project
          </Button>
        ) : (
          <Button
            variant="danger"
            size="md"
            className="shrink-0 text-[var(--accent-on)]"
            onClick={() => setOpen(true)}
          >
            <Archive />
            Archive project
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Archive this project?"
        description={`"${projectName}" will disappear from every list and its portal will stop answering.`}
        confirmLabel="Archive project"
        busy={busy}
        onConfirm={archive}
      >
        <p className="pb-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          The client will see a login page that never accepts their password. You can
          restore the project from this screen at any time.
        </p>
      </ConfirmDialog>
    </section>
  );
}
