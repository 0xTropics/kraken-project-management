"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * A page's tab strip: a project's sections, settings. Underline
 * rather than pills: the strip sits directly under the page title, and a second
 * filled control there would compete with the primary action on the right.
 * A tab is active only on its exact path.
 *
 * Overflows horizontally at 390px with the scrollbar hidden, so every tab stays
 * reachable on a phone without wrapping the header to two rows.
 */
export function TabNav({
  label,
  tabs,
}: {
  label: string;
  tabs: { label: string; href: string; badge?: number }[];
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={label}
      className="scroll-thin -mb-px flex items-center gap-0.5 overflow-x-auto px-2 md:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-9 shrink-0 items-center gap-1.5 rounded-t-[var(--radius-sm)] px-2.5",
              "text-sm transition-colors duration-100",
              "after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:rounded-full",
              active
                ? "font-medium text-[var(--text-primary)] after:bg-[var(--accent)]"
                : "text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]",
            )}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-2xs font-semibold tabular-nums",
                  active
                    ? "bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                    : "bg-[var(--bg-inset)] text-[var(--text-tertiary)]",
                )}
              >
                {tab.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
