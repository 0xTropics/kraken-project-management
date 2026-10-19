/**
 * Deliberately says nothing about what does exist. A client who mistypes a slug
 * and a stranger probing for other clients' projects see exactly this.
 */
export default function PortalNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-16">
      <div className="max-w-[23rem] text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
          Not found
        </h1>
        <p className="mt-3 text-md leading-[1.7] text-[var(--text-secondary)]">
          There is nothing at this address. If you were sent a link, check it for a typo — or ask
          for it again.
        </p>
      </div>
    </main>
  );
}
