"use client";

/**
 * The last resort: an error in the root layout itself, so this renders its own
 * <html>. Deliberately dependency-free and inline-styled — whatever broke may
 * have been the stylesheet.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "100dvh",
          margin: 0,
          fontFamily: "ui-sans-serif, -apple-system, system-ui, sans-serif",
          background: "#fff",
          color: "#37352f",
        }}
      >
        <div style={{ maxWidth: "24rem", textAlign: "center", padding: "0 1.25rem" }}>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 600, margin: 0 }}>Kraken could not start</h1>
          <p style={{ marginTop: "0.75rem", lineHeight: 1.7, color: "#6b6b64" }}>
            Something failed before the page could render.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              height: "2.5rem",
              padding: "0 1rem",
              borderRadius: 10,
              border: "1px solid rgba(15,15,15,0.13)",
              background: "#fff",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
