import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Code2 } from "lucide-react";
import { Badge, PROJECT_STATUS_META } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { TabNav } from "@/components/ui/tab-nav";
import { getProjectBySlug, getProjectStats } from "@/lib/data/projects";
import { billingModelLabel, billingRateLabel } from "@/lib/billing-model";
import { requireInternalPage } from "@/lib/auth/internal";

/**
 * The shell every project tab renders inside: identity on top, the seven-tab
 * strip underneath. Sibling tabs are built by other people, so this
 * layout owns the chrome and nothing else -- each `page.tsx` starts at its own
 * content and never repeats the title.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  await requireInternalPage();
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const stats = await getProjectStats(project.id);
  const base = `/app/projects/${project.slug}`;
  const status = PROJECT_STATUS_META[project.status];

  const rate = billingRateLabel(project);

  return (
    // A viewport-height column, because the tabs below own their own scrolling.
    // Below `md` the shell puts a 48px top bar above <main>, so a full 100dvh
    // here makes the page 48px taller than the viewport and the document
    // scrolls behind the tab's own scroller -- the same two-scrollbar symptom
    // as an escaping absolute, from a different cause. Subtract the bar.
    <div className="flex h-[calc(100dvh-3rem)] flex-col md:h-dvh">
      <PageHeader
        title={project.name}
        eyebrow={
          <Link
            href={`/app/clients/${project.client_id}`}
            className="truncate hover:text-[var(--text-secondary)]"
          >
            {project.client_name}
          </Link>
        }
        actions={
          <>
            <Badge tone={status.tone} className="hidden sm:inline-flex">
              {status.label}
            </Badge>
            <Tooltip content={`${billingModelLabel(project.billing_model)} · ${project.currency}`}>
              <Badge className="hidden md:inline-flex tabular-nums">{rate}</Badge>
            </Tooltip>
            {project.repo_url && (
              <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
                <a href={project.repo_url} target="_blank" rel="noreferrer noopener">
                  <Code2 />
                  Repo
                </a>
              </Button>
            )}
            <Button asChild variant="secondary" size="sm">
              <Link href={`${base}/portal`}>
                <ExternalLink />
                <span className="hidden sm:inline">Portal preview</span>
                <span className="sm:hidden">Portal</span>
              </Link>
            </Button>
          </>
        }
      >
        <TabNav
          label="Project sections"
          tabs={[
            { label: "Overview", href: base },
            { label: "Work items", href: `${base}/items`, badge: stats.items_open },
            { label: "Notes", href: `${base}/notes` },
            { label: "Time", href: `${base}/time` },
            { label: "Invoices", href: `${base}/invoices`, badge: stats.invoices_outstanding },
            { label: "Portal preview", href: `${base}/portal` },
            { label: "Settings", href: `${base}/settings` },
          ]}
        />
      </PageHeader>
      {/* min-h-0 lets a tab (the board) own its own scrolling instead of
          growing the page; tabs that just flow simply scroll here.

          `relative` is load-bearing, not decoration. Without a positioned
          ancestor, an absolutely-positioned descendant resolves against the
          initial containing block -- so it is neither laid out inside this box
          nor clipped by its overflow. Tailwind's `sr-only` is
          `position: absolute`, so every visually-hidden form label on a long
          tab escaped to <html> at its static offset and dragged the root
          scroll area down with it: the settings tab rendered a 2089px document
          inside a 940px viewport, giving a second scrollbar and stranding the
          sidebar's `sticky top-0`, which then had only 940px of runway. */}
      <div className="scroll-thin relative min-h-0 min-w-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
