import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { getProjectBySlug } from "@/lib/data/projects";
import { portalScopeForInternalPreview } from "@/lib/data/portal";
import { PortalView } from "@/components/portal/portal-view";
import { env } from "@/lib/env";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Portal preview" };

/**
 * The internal app renders the real portal for a project so the operator can
 * see exactly what the client sees before publishing.
 *
 * This is the same `PortalView` over the same queries — not a mock-up — which
 * is the only way the preview can actually be trusted. The scope comes from
 * `portalScopeForInternalPreview`, the single named exception to "the cookie is
 * the only source", and it is unreachable from any portal route. What protects
 * it here is this page's own `requireInternalPage()`, not the internal layout:
 * a layout's check does not stop the page beneath it from rendering.
 */
export default async function PortalPreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireInternalPage();
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const scope = portalScopeForInternalPreview(project.id);
  const url = `${env.appUrl}/portal/${project.slug}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[var(--border-subtle)] bg-[var(--warning-subtle)] px-4 py-2.5 md:px-6">
        <Eye className="size-3.5 shrink-0 text-[var(--warning)]" />
        <p className="text-xs font-medium text-[var(--text-primary)]">
          The same content and queries as the client&rsquo;s view
        </p>
        <p className="text-xs text-[var(--text-secondary)]">
          Unapproved notes, internal items, and unpublished invoices are absent because the portal
          queries never return them. Downloading and signing out are inert here; everything else is
          identical.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto shrink-0 text-xs text-[var(--accent-text)] underline-offset-2 hover:underline"
        >
          {url}
        </a>
      </div>

      {/* The portal draws its own full-height surface, so it is framed here
          rather than inheriting the internal page padding. */}
      <div className="bg-[var(--bg-app)]">
        <PortalView scope={scope} preview />
      </div>
    </div>
  );
}
