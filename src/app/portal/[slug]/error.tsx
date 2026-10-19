"use client";

export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-16">
      <div className="max-w-[23rem] text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
          Something went wrong
        </h1>
        <p className="mt-3 text-md leading-[1.7] text-[var(--text-secondary)]">
          This page could not be loaded. Trying again usually fixes it.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border-default)] px-4 text-md font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
