import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Folder, Mail, Plus, Star, Users } from "lucide-react";
import { Badge, PROJECT_STATUS_META } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat } from "@/components/dashboard/stat";
import {
  getClient,
  getClientContacts,
  getClientProjects,
  getClientTotals,
} from "@/lib/data/clients";
import { billingRateLabel } from "@/lib/billing-model";
import { formatHours, formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ClientForm } from "../client-form";
import { requireInternalPage } from "@/lib/auth/internal";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  await requireInternalPage();
  const { id } = await params;
  const client = await getClient(id);
  return { title: client?.name ?? "Client" };
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireInternalPage();
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const [projects, totals, contacts] = await Promise.all([
    getClientProjects(id),
    getClientTotals(id),
    getClientContacts(id),
  ]);
  const archived = client.archived_at !== null;
  const primaryContact = contacts.find((contact) => contact.is_primary) ?? null;

  return (
    <>
      <PageHeader
        title={client.name}
        eyebrow={
          <Link href="/app/clients" className="hover:text-[var(--text-secondary)]">
            Clients
          </Link>
        }
        actions={
          <>
            {archived && <Badge tone="neutral">Archived</Badge>}
            {primaryContact?.email && (
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <a href={`mailto:${primaryContact.email}`}>
                  <Mail />
                  Email
                </a>
              </Button>
            )}
            <Button asChild variant="primary" size="sm">
              <Link href="/app/projects/new">
                <Plus />
                <span className="hidden sm:inline">New project</span>
                <span className="sm:hidden">Project</span>
              </Link>
            </Button>
          </>
        }
      />

      <div className="mx-auto max-w-[76rem] space-y-8 px-4 py-6 md:px-6">
        {/* Contacts --------------------------------------------------------- */}
        <section aria-labelledby="contacts-heading">
          <SectionTitle className="mb-3" count={contacts.length}>
            <span id="contacts-heading">Contacts</span>
          </SectionTitle>
          {contacts.length === 0 ? (
            <EmptyState
              compact
              icon={Users}
              title="No contacts yet"
              description="Add one from the details panel so invoices know who to bill."
            />
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
              {contacts.map((contact) => (
                <li
                  key={contact.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
                >
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                    <span className="truncate">{contact.name}</span>
                    {contact.is_primary && (
                      <span className="inline-flex items-center gap-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--accent-text)]">
                        <Star className="size-3 fill-current" aria-hidden="true" />
                        Primary
                      </span>
                    )}
                  </p>
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-sm text-[var(--text-tertiary)] hover:text-[var(--accent-text)]"
                    >
                      {contact.email}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Money ---------------------------------------------------------- */}
        <section aria-labelledby="totals-heading">
          <SectionTitle className="mb-3">
            <span id="totals-heading">Billed to date</span>
          </SectionTitle>
          {totals.length === 0 ? (
            <p className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] px-4 py-3 text-sm text-[var(--text-tertiary)]">
              Nothing invoiced yet. Totals appear here once an invoice is finalized.
            </p>
          ) : (
            <div
              className={cn(
                "grid gap-px grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[var(--radius-lg)]",
                "border border-[var(--border-subtle)] bg-[var(--border-subtle)] sm:grid-cols-2",
                // Only widen to four tracks when there is a second currency to
                // fill them, or the hairline background shows through as a slab.
                totals.length > 1 && "xl:grid-cols-4",
              )}
            >
              {totals.flatMap((row) => [
                <Stat
                  key={`${row.currency}-invoiced`}
                  label={`Invoiced · ${row.currency}`}
                  className="rounded-none border-0"
                  value={formatMoney(row.invoiced, row.currency)}
                >
                  <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                    Sent and paid invoices, excluding voids.
                  </p>
                </Stat>,
                <Stat
                  key={`${row.currency}-outstanding`}
                  label={`Outstanding · ${row.currency}`}
                  className="rounded-none border-0"
                  tone={row.outstanding > 0 ? "warning" : "default"}
                  value={formatMoney(row.outstanding, row.currency)}
                >
                  <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                    {row.outstanding > 0 ? "Sent, not yet paid." : "Everything is settled."}
                  </p>
                </Stat>,
              ])}
            </div>
          )}
        </section>

        <div className="grid gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-10">
          {/* Projects ----------------------------------------------------- */}
          <section aria-labelledby="projects-heading" className="min-w-0">
            <SectionTitle className="mb-3" count={projects.length}>
              <span id="projects-heading">Projects</span>
            </SectionTitle>
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
              {projects.length === 0 ? (
                <EmptyState
                  compact
                  icon={Folder}
                  title="No projects yet"
                  description="Create the first project for this client and they get a portal with it."
                  action={
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/app/projects/new">
                        <Plus />
                        New project
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {projects.map((project) => {
                    const status = PROJECT_STATUS_META[project.status];
                    return (
                      <li key={project.id}>
                        <Link
                          href={`/app/projects/${project.slug}`}
                          className="flex items-center gap-3 px-4 py-3 transition-colors duration-75 hover:bg-[var(--bg-hover)]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-medium text-[var(--text-primary)]">
                              {project.name}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-2xs text-[var(--text-tertiary)]">
                              <span>
                                {billingRateLabel(project)}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {formatHours(project.hours_worked)} logged
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {project.open_items} open item
                                {project.open_items === 1 ? "" : "s"}
                              </span>
                            </p>
                          </div>
                          <Badge tone={status.tone} className="shrink-0">
                            {status.label}
                          </Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* Details ------------------------------------------------------ */}
          <div className="min-w-0">
            <ClientForm
              // `replaceClientContacts` deletes and reinserts on every save, so
              // every contact gets a fresh id — folding those ids into the key
              // alongside `updated_at` forces a remount (and a re-seed from the
              // freshly written rows) even when a save touches contacts only,
              // which never bumps the client row's own `updated_at`.
              key={`${client.updated_at}|${contacts.map((c) => c.id).join(",")}`}
              client={client}
              contacts={contacts}
            />
          </div>
        </div>
      </div>
    </>
  );
}
