import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-16">
      <div className="max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
          Not found
        </h1>
        <p className="mt-3 text-md leading-[1.7] text-[var(--text-secondary)]">
          There is nothing at this address.
        </p>
        <Link
          href="/app"
          className="mt-6 inline-flex h-10 items-center rounded-[var(--radius-lg)] border border-[var(--border-default)] px-4 text-md font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          Go to Kraken
        </Link>
      </div>
    </main>
  );
}
