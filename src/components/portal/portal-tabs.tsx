import Link from "next/link";
import { cn } from "@/lib/cn";

export type PortalTab = "overview" | "invoices" | "requests";

const TABS: { id: PortalTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "invoices", label: "Invoices" },
  { id: "requests", label: "Requests" },
];

/**
 * Three tabs, driven by `?tab=` rather than client state: a client can link to
 * the invoices view, a refresh keeps it, and `PortalView` stays a server
 * component with no hydration boundary.
 *
 * Inert in the preview, like sign-out and the PDF button -- the operator is
 * looking at a project page, not signed in as the client.
 */
export function PortalTabs({
  active,
  slug,
  preview = false,
}: {
  active: PortalTab;
  slug: string;
  preview?: boolean;
}) {
  return (
    <nav aria-label="Portal sections" className="flex items-stretch gap-1">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        const className = cn(
          "flex min-h-11 items-center border-b-2 px-2.5 text-base transition-colors sm:min-h-0 sm:py-3.5",
          isActive
            ? "border-[var(--accent)] font-medium text-[var(--text-primary)]"
            : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
        );

        if (preview) {
          return (
            <span key={tab.id} aria-current={isActive ? "page" : undefined} className={className}>
              {tab.label}
            </span>
          );
        }

        return (
          <Link
            key={tab.id}
            href={tab.id === "overview" ? `/portal/${slug}` : `/portal/${slug}?tab=${tab.id}`}
            aria-current={isActive ? "page" : undefined}
            className={className}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
