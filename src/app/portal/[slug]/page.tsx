import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PortalLoginForm } from "@/components/portal/login-form";
import { PortalView } from "@/components/portal/portal-view";
import { findProjectForLogin, portalScope } from "@/lib/data/portal";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = await findProjectForLogin(slug);

  // The unknown-slug check happens here, not only in the page body. The route
  // has a `loading.tsx`, so Next streams a shell and the HTTP status is
  // committed before the page component runs -- a `notFound()` down there
  // renders the right screen but leaves a 200 on the wire. Metadata is
  // resolved before the response is committed, so this is where the 404 has to
  // be raised.
  if (!project) notFound();

  // The title is the only thing a valid slug reveals.
  return { title: project.name };
}

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ "signed-out"?: string; tab?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  // The slug decides which login to show. It never decides which data to read.
  const target = await findProjectForLogin(slug);
  if (!target) notFound();

  const scope = await portalScope();

  // A cookie for a different project is not a session for this one: show this
  // project's login rather than the other project's data.
  if (!scope || scope.projectId !== target.id) {
    return (
      <PortalLoginForm
        slug={target.slug}
        projectName={target.name}
        signedOut={query["signed-out"] === "1"}
      />
    );
  }

  // Streaming lives here rather than in a route-level `loading.tsx`: an
  // implicit Suspense boundary around the whole route commits a 200 before the
  // slug is resolved, which would turn every unknown-slug request into a 200.
  return (
    <Suspense fallback={<PortalSkeleton />}>
      <PortalView
        scope={scope}
        tab={query.tab === "invoices" ? "invoices" : query.tab === "requests" ? "requests" : "overview"}
      />
    </Suspense>
  );
}

/**
 * Stands in for the dashboard, not for the old single column: the fallback has
 * to have the shape of what replaces it, or every load flashes one layout and
 * swaps to another.
 */
function PortalSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="h-14 shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]" />
      <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 py-6 md:px-8">
        <div className="shrink-0">
          <div className="skeleton h-8 w-3/12" />
          <div className="skeleton mt-2 h-4 w-4/12" />
        </div>
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_1fr_1fr_0.95fr]">
          {[0, 1, 2, 3].map((column) => (
            <div
              key={column}
              className="min-h-0 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-3"
            >
              <div className="skeleton h-4 w-24" />
              <div className="skeleton mt-4 h-16 w-full" />
              <div className="skeleton mt-2 h-16 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
