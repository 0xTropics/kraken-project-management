"use client";

import * as React from "react";
import { AlertTriangle, Check, Copy, KeyRound, Loader2, Shuffle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Modal, ModalContent } from "@/components/ui/modal";
import { PortalPasswordInput } from "@/components/projects/portal-password-input";
import { ApiRequestError, api } from "@/lib/client-api";
import { toast } from "sonner";

/**
 * Portal address and password. The stored hash is never rendered —
 * there is nothing on this screen that could reveal the current password, only
 * a way to replace it.
 */
export function PortalAccessCard({
  projectId,
  portalUrl,
  passwordVersion,
}: {
  projectId: string;
  portalUrl: string;
  passwordVersion: number;
}) {
  const [copied, setCopied] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [rotating, startRotating] = React.useTransition();

  async function copy() {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not reach the clipboard");
    }
  }

  function rotate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startRotating(async () => {
      try {
        await api(`/api/internal/projects/${projectId}/portal-password`, {
          method: "POST",
          body: { portal_password: password },
        });
        toast.success("Password rotated. Every open portal session has been signed out.");
        setOpen(false);
        setPassword("");
      } catch (caught) {
        setError(
          caught instanceof ApiRequestError
            ? (caught.body.issues?.[0]?.message ?? caught.message)
            : "Could not rotate the password",
        );
      }
    });
  }

  return (
    <section aria-labelledby="portal-heading" className="space-y-4">
      <SectionTitle>
        <span id="portal-heading">Client portal</span>
      </SectionTitle>

      <Field
        label="Portal address"
        htmlFor="portal_url"
        hint="Send this and the password together. There are no client accounts — the password is the whole login."
      >
        <div className="flex items-center gap-2">
          <Input
            id="portal_url"
            value={portalUrl}
            readOnly
            spellCheck={false}
            className="min-w-0 flex-1 font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            variant="secondary"
            size="md"
            className="shrink-0"
            aria-label="Copy the portal address"
            onClick={copy}
          >
            {copied ? <Check /> : <Copy />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
      </Field>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-base font-medium text-[var(--text-primary)]">
              <KeyRound className="size-3.5 text-[var(--text-tertiary)]" />
              Portal password
              <Badge tone="neutral" className="tabular-nums">v{passwordVersion}</Badge>
            </p>
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-[var(--text-tertiary)]">
              Only an argon2id hash is stored, so the current password cannot be shown
              again — rotating replaces it. Every portal cookie carries the version it
              was issued under, so{" "}
              <strong className="font-medium text-[var(--text-secondary)]">
                rotating immediately signs out every open client session
              </strong>
              .
            </p>
          </div>
          <Button variant="secondary" size="md" className="shrink-0" onClick={() => setOpen(true)}>
            <Shuffle />
            Rotate
          </Button>
        </div>
      </div>

      <Modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setPassword("");
            setError(null);
          }
        }}
      >
        <ModalContent
          title="Rotate the portal password"
          description="The old password stops working the moment you confirm."
          size="sm"
        >
          <form onSubmit={rotate} className="space-y-4 pb-4">
            <div className="flex gap-2.5 rounded-[var(--radius-md)] bg-[var(--warning-subtle)] px-3 py-2.5">
              <AlertTriangle className="mt-px size-4 shrink-0 text-[var(--warning)]" />
              <p className="text-xs leading-relaxed text-[var(--warning)]">
                This signs out every client who is currently in the portal, on every
                device, straight away. They will see the login screen again and cannot
                get back in until you send them the new password.
              </p>
            </div>

            <Field
              label="New portal password"
              htmlFor="rotate_password"
              required
              error={error}
              hint="At least 10 characters."
            >
              <PortalPasswordInput
                id="rotate_password"
                value={password}
                onChange={setPassword}
                invalid={Boolean(error)}
                autoFocus
                compact
              />
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                size="md"
                className="text-[var(--accent-on)]"
                disabled={rotating || password.length < 10}
              >
                {rotating && <Loader2 className="animate-spin" />}
                Rotate and sign everyone out
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>
    </section>
  );
}
