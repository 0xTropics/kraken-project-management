"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { AuthShell } from "@/components/login/auth-shell";
import { safeNextPath } from "@/lib/auth/next-path";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Sign in failed");
        setPending(false);
        return;
      }
      router.replace(safeNextPath(next));
      router.refresh();
    } catch {
      setError("Could not reach the server");
      setPending(false);
    }
  }

  return (
    <AuthShell onSubmit={onSubmit}>
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          placeholder="you@example.com"
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••••"
        />
      </Field>

      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] bg-[var(--danger-subtle)] px-3 py-2 text-xs text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Signing in" : "Sign in"}
      </Button>
    </AuthShell>
  );
}
