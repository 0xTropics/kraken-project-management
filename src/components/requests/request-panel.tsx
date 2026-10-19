"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Modal, SheetContent } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { api, run } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import { CLIENT_FACING_META, clientRequestStatus } from "@/lib/requests/status";
import type { ClientRequestRow } from "@/lib/data/client-requests";
import { RequestImages } from "./request-images";

/**
 * A request, opened from the inbox with `?request=<id>`. Same sheet as the
 * work-item detail panel. Accept and decline are the only actions; a decided
 * request shows its decision instead of buttons.
 */
export function RequestPanel({
  request,
  closeHref,
}: {
  request: ClientRequestRow | null;
  closeHref: string;
}) {
  const router = useRouter();
  const [declining, setDeclining] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [busy, startBusy] = React.useTransition();
  const [acceptedItem, setAcceptedItem] = React.useState<string | null>(null);

  function accept() {
    if (!request) return;
    startBusy(async () => {
      const result = await run(
        api<{ workItemId: string }>(`/api/internal/requests/${request.id}/accept`, { method: "POST" }),
        { success: "Accepted — added to the backlog.", error: "Could not accept that request" },
      );
      if (result) {
        setAcceptedItem(result.workItemId);
        router.refresh();
      }
    });
  }

  function decline() {
    if (!request) return;
    startBusy(async () => {
      const result = await run(
        api(`/api/internal/requests/${request.id}/decline`, { method: "POST", body: { note } }),
        { success: "Declined.", error: "Could not decline that request" },
      );
      if (result !== null) router.push(closeHref, { scroll: false });
    });
  }

  const meta = request
    ? CLIENT_FACING_META[clientRequestStatus(request.status, request.item_status)]
    : null;
  const itemId = acceptedItem ?? request?.work_item_id ?? null;

  return (
    <Modal
      open={Boolean(request)}
      onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}
    >
      <SheetContent>
        {request && meta && (
          <>
            <div className="flex items-start gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="break-words text-lg font-semibold text-[var(--text-primary)]">
                  {request.title}
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                  {request.project_name} · {request.requester_name} ·{" "}
                  {formatDateTime(request.created_at)}
                </Dialog.Description>
              </div>
              <Badge tone={meta.tone} className="mt-1 shrink-0">
                {meta.label}
              </Badge>
              <Dialog.Close asChild>
                <IconButton label="Close" variant="ghost" size="sm">
                  <X />
                </IconButton>
              </Dialog.Close>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="whitespace-pre-wrap break-words text-sm text-[var(--text-primary)]">
                {request.body}
              </p>
              <RequestImages request={request} className="mt-4" />
              {request.status === "declined" && (
                <p className="mt-4 whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--bg-inset)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                  Declined {formatDateTime(request.decided_at)}
                  {request.decline_note ? ` — “${request.decline_note}”` : " with no note."}
                </p>
              )}
              {declining && (
                <Field label="Note to the client (optional)" htmlFor="decline-note" className="mt-4">
                  <Textarea
                    id="decline-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={1000}
                    rows={3}
                  />
                </Field>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] px-5 py-3">
              {request.status === "submitted" && !acceptedItem ? (
                declining ? (
                  <>
                    <Button variant="danger" size="sm" disabled={busy} onClick={decline}>
                      Decline request
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeclining(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="primary" size="sm" disabled={busy} onClick={accept}>
                      Accept → backlog
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => setDeclining(true)}
                    >
                      Decline…
                    </Button>
                  </>
                )
              ) : itemId ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/app/projects/${request.project_slug}/items?item=${itemId}`}>
                    Open work item
                  </Link>
                </Button>
              ) : (
                <p className="text-xs text-[var(--text-tertiary)]">
                  {request.status === "accepted" ? "Its work item was deleted." : "No work item."}
                </p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Modal>
  );
}
