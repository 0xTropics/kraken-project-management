import { requireInternalPage } from "@/lib/auth/internal";
import { getNavProjects } from "@/lib/data/nav";
import { countSubmittedRequests } from "@/lib/data/client-requests";
import { AppShell } from "@/components/app-shell/app-shell";

export const dynamic = "force-dynamic";

/**
 * Every internal page hangs off this layout, and this layout will not render
 * without a verified internal session. That protects the shell only: the
 * router renders each page on its own, so every page and nested layout makes
 * the same check itself. The proxy redirect is a convenience.
 */
export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireInternalPage("/app");

  const [projects, requestCount] = await Promise.all([getNavProjects(), countSubmittedRequests()]);

  return (
    <AppShell projects={projects} requestCount={requestCount} email={session.email}>
      {children}
    </AppShell>
  );
}
