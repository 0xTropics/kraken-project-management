import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * The portal's own small set of primitives.
 *
 * The internal app's components are tuned for Plane's density: 11px chips, 28px
 * buttons, 32px rows. The portal is the calmest surface in the system,
 * so it re-derives a handful of shapes at a reading scale. Everything still
 * draws from the same CSS variables, so both themes and any future palette
 * change come along for free.
 */

const PILL_TONES = {
  neutral: "bg-[var(--bg-inset)] text-[var(--text-secondary)]",
  // Solid, not the `-subtle`/`-text` tint pair the other tones use: at 16%
  // alpha over `--bg-panel` in dark mode, `--info-text` measures ~4.24:1,
  // under the 4.5:1 AA floor for text this size (there is no `--info-on`
  // token to pair with a solid `--info` fill, so this reuses `--accent-on`,
  // which is defined for the same light/dark contrast zone accent and info
  // share, and is already load-bearing elsewhere -- not a new global token).
  info: "bg-[var(--info)] text-[var(--accent-on)]",
  success: "bg-[var(--success-subtle)] text-[var(--success-text)]",
  warning: "bg-[var(--warning-subtle)] text-[var(--warning-text)]",
} as const;

/** A badge at portal scale: 12px rather than the internal app's 11px. */
export function PortalPill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: keyof typeof PILL_TONES;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1",
        "text-xs font-medium leading-none",
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const DOT_TONES = {
  neutral: "bg-[var(--text-tertiary)]",
  info: "bg-[var(--info)]",
  success: "bg-[var(--success)]",
  warning: "bg-[var(--warning)]",
} as const;

export function PortalDot({ tone }: { tone: keyof typeof DOT_TONES }) {
  return (
    <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", DOT_TONES[tone])} />
  );
}
