import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { listClients } from "@/lib/data/clients";
import { formatRelative } from "@/lib/format";
import { requireInternalPage } from "@/lib/auth/internal";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  await requireInternalPage("/app/clients");
  const clients = await listClients();

  return (
    <>
      <PageHeader
        title="Clients"
        actions={
          <Button asChild variant="primary" size="sm">
            <Link href="/app/clients/new">
              <Plus />
              New client
            </Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-[70rem] px-4 py-6 md:px-6">
        {clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No clients yet"
            description="A client owns one or more projects. Add one before creating a project."
            action={
              <Button asChild variant="primary" size="md">
                <Link href="/app/clients/new">
                  <Plus />
                  New client
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
            <Table>
              <THead>
                <tr>
                  <TH>Client</TH>
                  <TH className="hidden sm:table-cell">Contact</TH>
                  <TH numeric>Projects</TH>
                  <TH numeric className="hidden md:table-cell">Open items</TH>
                  <TH className="hidden lg:table-cell">Last activity</TH>
                </tr>
              </THead>
              <TBody>
                {clients.map((client) => (
                  <TR key={client.id} interactive>
                    <TD className="max-w-[18rem]">
                      <Link
                        href={`/app/clients/${client.id}`}
                        className="block truncate font-medium text-[var(--text-primary)] hover:text-[var(--accent-text)]"
                      >
                        {client.name}
                      </Link>
                    </TD>
                    <TD className="hidden max-w-[16rem] truncate sm:table-cell">
                      {client.primary_contact_name ?? "—"}
                      {client.primary_contact_email && (
                        <span className="ml-1.5 text-[var(--text-tertiary)]">
                          {client.primary_contact_email}
                        </span>
                      )}
                    </TD>
                    <TD numeric>
                      <span className="text-[var(--text-primary)]">{client.active_projects}</span>
                      {client.project_count !== client.active_projects && (
                        <span className="text-[var(--text-tertiary)]">
                          {" "}
                          / {client.project_count}
                        </span>
                      )}
                    </TD>
                    <TD numeric className="hidden md:table-cell">
                      {client.open_items}
                    </TD>
                    <TD className="hidden whitespace-nowrap text-[var(--text-tertiary)] lg:table-cell">
                      {formatRelative(client.last_activity)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
