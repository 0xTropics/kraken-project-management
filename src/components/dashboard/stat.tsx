import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * A single headline number. Deliberately flat — no shadow, no gradient, a
 * hairline and a lot of quiet. The value is the loudest thing in the box.
 */
export function Stat({
  label,
  value,
  sub,
  tone = "default",
  href,
  className,
  children,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "warning" | "success";
  href?: string;
  className?: string;
  /** Between the value and `sub`: a HoursBar, or a sub line with its own spacing. */
  children?: React.ReactNode;
}) {
  const tones = {
    default: "text-[var(--text-primary)]",
    warning: "text-[var(--warning)]",
    success: "text-[var(--success)]",
  } as const;

  const inner = (
    <>
      <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className={cn("mt-1.5 text-2xl font-semibold tabular-nums leading-none", tones[tone])}>
        {value}
      </p>
      {children}
      {sub && <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">{sub}</p>}
    </>
  );

  const base = cn(
    "rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4",
    href && "transition-colors duration-100 hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)]",
    className,
  );

  return href ? (
    <Link href={href} className={cn(base, "block")}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

/** Worked-vs-billed bar. The unbilled remainder is the goodwill written off. */
export function HoursBar({
  worked,
  billed,
  label = `${billed} of ${worked} hours billed`,
}: {
  worked: number;
  billed: number;
  label?: string;
}) {
  const pct = worked > 0 ? Math.min(100, (billed / worked) * 100) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-inset)]"
      role="img"
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
