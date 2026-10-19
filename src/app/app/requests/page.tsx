import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { RequestPanel } from "@/components/requests/request-panel";
import { ProjectFilter } from "@/components/requests/project-filter";
import { getClientRequest, listClientRequests } from "@/lib/data/client-requests";
import { listProjects } from "@/lib/data/projects";
import { CLIENT_REQUEST_STATUSES, type ClientRequestStatus } from "@/lib/db/types";
import { CLIENT_FACING_META, clientRequestStatus } from "@/lib/requests/status";
import { UUID_RE } from "@/lib/api/schemas";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import { one, type Search } from "../search-params";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Client requests" };

const LABELS: Record<ClientRequestStatus, string> = {
  submitted: "Submitted",
  accepted: "Accepted",
  declined: "Declined",
};

/** The triage inbox. Filters and the open request are URL state, like the audit log. */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireInternalPage("/app/requests");
  const params = await searchParams;
  const raw = one(params.status);
  const status: ClientRequestStatus = (CLIENT_REQUEST_STATUSES as readonly string[]).includes(raw)
    ? (raw as ClientRequestStatus)
    : "submitted";
  const projectId = UUID_RE.test(one(params.project)) ? one(params.project) : undefined;
  const openId = one(params.request);

  const [rows, projects, open] = await Promise.all([
    listClientRequests({ status, projectId }),
    listProjects(),
    UUID_RE.test(openId) ? getClientRequest(openId) : Promise.resolve(null),
  ]);

  function href(patch: { status?: ClientRequestStatus; request?: string }): string {
    const query = new URLSearchParams();
    const nextStatus = patch.status ?? status;
    if (nextStatus !== "submitted") query.set("status", nextStatus);
    if (projectId) query.set("project", projectId);
    if (patch.request) query.set("request", patch.request);
    const search = query.toString();
    return search ? `/app/requests?${search}` : "/app/requests";
  }

  return (
    <>
      <PageHeader title="Client requests">
        <nav
          aria-label="Request status"
          className="scroll-thin -mb-px flex items-center gap-0.5 overflow-x-auto px-2 md:px-4"
        >
          {CLIENT_REQUEST_STATUSES.map((value) => (
            <Link
              key={value}
              href={href({ status: value })}
              aria-current={value === status ? "page" : undefined}
              className={cn(
                "relative flex h-9 shrink-0 items-center rounded-t-[var(--radius-sm)] px-2.5 text-sm transition-colors duration-100",
                "after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:rounded-full",
                value === status
                  ? "font-medium text-[var(--text-primary)] after:bg-[var(--accent)]"
                  : "text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]",
              )}
            >
              {LABELS[value]}
            </Link>
          ))}
        </nav>
      </PageHeader>

      <div className="mx-auto max-w-[64rem] space-y-4 px-4 py-6 md:px-6">
        <Suspense fallback={<div className="h-8" />}>
          <ProjectFilter
            value={projectId ?? ""}
            projects={projects
              .filter((project) => !project.archived_at)
              .map((project) => ({ id: project.id, label: `${project.client_name} — ${project.name}` }))}
          />
        </Suspense>

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
          {rows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={`No ${LABELS[status].toLowerCase()} requests`}
              description="Requests clients send from the portal appear here."
            />
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {rows.map((row) => {
                const meta = CLIENT_FACING_META[clientRequestStatus(row.status, row.item_status)];
                return (
                  <li key={row.id}>
                    <Link
                      href={href({ request: row.id })}
                      scroll={false}
                      className="flex items-center gap-3 px-4 py-3 transition-colors duration-75 hover:bg-[var(--bg-hover)]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base text-[var(--text-primary)]">{row.title}</p>
                        <p className="mt-0.5 truncate text-2xs text-[var(--text-tertiary)]">
                          {row.project_name} · {row.requester_name} · {formatRelative(row.created_at)}
                          {row.image_ids.length > 0 &&
                            ` · ${row.image_ids.length} image${row.image_ids.length === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      <Badge tone={meta.tone} className="shrink-0">
                        {meta.label}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <RequestPanel key={open?.id} request={open} closeHref={href({})} />
    </>
  );
}
