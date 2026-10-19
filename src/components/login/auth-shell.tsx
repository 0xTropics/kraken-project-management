import * as React from "react";
import { KrakenMark } from "@/components/app-shell/kraken-mark";
import { Wordmark } from "@/components/app-shell/wordmark";
import { AsciiBackdrop } from "@/components/login/ascii-backdrop";

/**
 * The sign-in chrome shared by the operator and the portal -- mark, wordmark,
 * card and animated backdrop -- so the portal reads as part of the same
 * product. `children` are the form's fields.
 */
export function AuthShell({
  onSubmit,
  children,
}: {
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}) {
  return (
    // `relative` is load-bearing: the backdrop is absolutely positioned, and an
    // absolute child of an unpositioned ancestor resolves against the initial
    // containing block instead of being clipped here.
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[var(--bg-sunken)] px-5 py-12">
      <AsciiBackdrop className="pointer-events-none absolute inset-0 h-full w-full select-none" />

      <div className="relative w-full max-w-[22rem]">
        <div className="mb-7 flex flex-col items-center text-center">
          <KrakenMark className="size-9" />
          <h1 className="mt-4">
            <Wordmark size="lg" subtitle className="items-center" />
          </h1>
        </div>

        {/* method="post" so a submit before hydration cannot put the
            password into the URL as a query string. */}
        <form
          method="post"
          onSubmit={onSubmit}
          className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-6 shadow-[var(--shadow-card)]"
        >
          {children}
        </form>
      </div>
    </main>
  );
}
