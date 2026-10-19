import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ScrollText, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AuditFilters, type AuditFilterState } from "@/components/settings/audit-filters";
import { AuditTable } from "@/components/settings/audit-table";
import { listAuditActions, listAuditLog } from "@/lib/data/audit";
import { listProjects } from "@/lib/data/projects";
import { ACTOR_TYPES, type ActorType } from "@/lib/db/types";
import { one, type Search } from "../../search-params";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The forensic view. Filters are URL state so a question can be
 * linked; the table is server-rendered so a 200-row page is one round trip and
 * no client-side sorting can disagree with the database.
 */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireInternalPage("/app/settings/audit");
  const params = await searchParams;

  const rawActorType = one(params.actor_type);
  const from = DATE_RE.test(one(params.from)) ? one(params.from) : "";
  const to = DATE_RE.test(one(params.to)) ? one(params.to) : "";
  const state: AuditFilterState = {
    actorType: (ACTOR_TYPES as readonly string[]).includes(rawActorType)
      ? (rawActorType as ActorType)
      : "",
    actorId: one(params.actor),
    projectId: one(params.project),
    action: one(params.action),
    from,
    to,
  };
  const page = Math.max(1, Number.parseInt(one(params.page), 10) || 1);

  const [result, actions, projects] = await Promise.all([
    listAuditLog({
      actorType: state.actorType || undefined,
      actorId: state.actorId || undefined,
      projectId: state.projectId || undefined,
      action: state.action || undefined,
      from: state.from || undefined,
      to: state.to || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listAuditActions(),
    listProjects(),
  ]);

  const filtered = Object.values(state).some(Boolean);
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const first = result.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, result.total);

  function pageHref(target: number): string {
    const query = new URLSearchParams();
    if (state.actorType) query.set("actor_type", state.actorType);
    if (state.actorId) query.set("actor", state.actorId);
    if (state.projectId) query.set("project", state.projectId);
    if (state.action) query.set("action", state.action);
    if (state.from) query.set("from", state.from);
    if (state.to) query.set("to", state.to);
    if (target > 1) query.set("page", String(target));
    const search = query.toString();
    return search ? `/app/settings/audit?${search}` : "/app/settings/audit";
  }

  return (
    <div className="mx-auto max-w-[84rem] space-y-4 px-4 py-6 md:px-6">
      <AuditFilters
        state={state}
        actions={actions}
        projects={projects.map((project) => ({
          id: project.id,
          name: project.name,
          client_name: project.client_name,
        }))}
      />

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
        {result.rows.length === 0 ? (
          filtered ? (
            <EmptyState
              compact
              icon={SearchX}
              title="No entries match"
              description="Nothing was recorded under this combination of actor, project, action, and dates."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link href="/app/settings/audit">Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ScrollText}
              title="Nothing recorded yet"
              description="Every internal action and every portal login is appended here. The table refuses UPDATE and DELETE at the database level, so what lands here stays."
            />
          )
        ) : (
          <>
            <AuditTable rows={result.rows} />
            <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-3 py-2">
              <p className="text-xs tabular-nums text-[var(--text-tertiary)]">
                {first}–{last} of {result.total}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="mr-1 hidden text-xs tabular-nums text-[var(--text-tertiary)] sm:inline">
                  Page {page} of {pages}
                </span>
                {page > 1 ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={pageHref(page - 1)} scroll={false}>
                      <ChevronLeft />
                      Newer
                    </Link>
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" disabled>
                    <ChevronLeft />
                    Newer
                  </Button>
                )}
                {page < pages ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={pageHref(page + 1)} scroll={false}>
                      Older
                      <ChevronRight />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" disabled>
                    Older
                    <ChevronRight />
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
