"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { AuthShell } from "@/components/login/auth-shell";
import { portalLoginErrorMessage } from "@/lib/portal/login-error";

/**
 * Password only. Nothing about the project is rendered before
 * the password is verified except its name, which the slug already reveals.
 *
 * The client's *company* name used to be shown here and is deliberately gone:
 * it was the one thing on this screen that a stranger with a guessed slug
 * learned and could not have got from the URL.
 */
export function PortalLoginForm({
  slug,
  projectName,
  signedOut,
}: {
  slug: string;
  projectName: string;
  signedOut?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    try {
      const response = await fetch(`/api/portal/${encodeURIComponent(slug)}/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(portalLoginErrorMessage(response.status, body));
        setPending(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again in a moment.");
      setPending(false);
    }
  }

  return (
    <AuthShell onSubmit={onSubmit}>
      <h2 className="text-sm font-medium text-[var(--text-primary)]">{projectName} Login:</h2>

      {signedOut && (
        <p className="text-xs text-[var(--text-tertiary)]">
          Signed out. Enter the password again whenever you want to check in.
        </p>
      )}

      <Field label="Password" htmlFor="portal-password" error={error}>
        <Input
          id="portal-password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          placeholder="••••••••••"
          aria-invalid={error ? true : undefined}
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Checking" : "Continue"}
      </Button>
    </AuthShell>
  );
}
