import { cn } from "@/lib/cn";

/**
 * "Kraken", set in the display face rather than the UI font.
 *
 * The name is the one piece of type in the app that is a mark rather than
 * content, so it is the only thing that uses `--font-display`. Everything else
 * stays on the system stack, which is what keeps the interface feeling native.
 *
 * `subtitle` is opt-in: the login page has room for it, the 48px mobile top bar
 * does not.
 */
export function Wordmark({
  className,
  size = "sm",
  subtitle = false,
}: {
  className?: string;
  size?: "sm" | "lg";
  subtitle?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 flex-col", subtitle ? "gap-2" : null, className)}>
      <span
        className={cn(
          "font-[family-name:var(--font-display)] font-medium text-[var(--text-primary)]",
          size === "lg"
            ? "text-2xl leading-none tracking-[-0.02em]"
            : "text-sm leading-none tracking-[-0.01em]",
        )}
      >
        Kraken
      </span>
      {subtitle && (
        <span className="text-2xs font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
          Project Acceleration
        </span>
      )}
    </span>
  );
}
