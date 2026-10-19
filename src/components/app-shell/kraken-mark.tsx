import { cn } from "@/lib/cn";

/**
 * The mark: a kraken eye above three curling arms, drawn on an 24x24 grid so it
 * stays crisp at 16px in the sidebar.
 */
export function KrakenMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("text-[var(--accent)]", className)}
    >
      <path
        d="M12 2.75c-3.73 0-6.5 2.72-6.5 6.28 0 1.62.5 2.86 1.2 4.06"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12 2.75c3.73 0 6.5 2.72 6.5 6.28 0 1.62-.5 2.86-1.2 4.06"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M6.7 13.09c-.9 1.5-2.02 2.2-3.45 2.2M17.3 13.09c.9 1.5 2.02 2.2 3.45 2.2M12 12.6v3.3c0 2.2-1.1 3.6-2.9 4.2M12 15.9c0 2.2 1.1 3.6 2.9 4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="9" r="1.15" fill="currentColor" />
      <circle cx="14.5" cy="9" r="1.15" fill="currentColor" />
    </svg>
  );
}
