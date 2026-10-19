import type { Metadata } from "next";
import { Building2, ScrollText, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, SectionLink } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listAuditLog } from "@/lib/data/audit";
import { requireInternalPage } from "@/lib/auth/internal";
import { env } from "@/lib/env";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Settings" };

/**
 * Settings overview: what is true of the whole workspace — what goes on a
 * document, your account, and what has been done. Project-level settings live
 * on the project.
 */
export default async function SettingsPage() {
  const session = await requireInternalPage("/app/settings");
  const recent = await listAuditLog({ limit: 6 });

  const company: { label: string; value: string; variable: string }[] = [
    { label: "Company", value: env.companyName, variable: "KRAKEN_COMPANY_NAME" },
    { label: "Billing email", value: env.companyEmail, variable: "KRAKEN_COMPANY_EMAIL" },
    { label: "Address", value: env.companyAddress, variable: "KRAKEN_COMPANY_ADDRESS" },
  ];

  return (
    <div className="mx-auto max-w-[64rem] space-y-5 px-4 py-6 md:px-6">
      {/* Document identity ------------------------------------------------ */}
      <Card>
        <CardHeader
          title="Document details"
          description="The letterhead on every invoice PDF and every published portal document."
          action={<Building2 className="size-4 text-[var(--text-tertiary)]" />}
        />
        <dl className="divide-y divide-[var(--border-subtle)]">
          {company.map((row) => (
            <div
              key={row.variable}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5"
            >
              <dt className="w-28 shrink-0 text-xs text-[var(--text-tertiary)]">{row.label}</dt>
              <dd className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="min-w-0 truncate text-sm text-[var(--text-primary)]">
                  {row.value || <span className="text-[var(--text-tertiary)]">Not set</span>}
                </span>
                <code className="shrink-0 rounded-[var(--radius-xs)] bg-[var(--bg-inset)] px-1.5 py-0.5 font-mono text-2xs text-[var(--text-tertiary)]">
                  {row.variable}
                </code>
              </dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-[var(--border-subtle)] px-4 py-2.5 text-xs text-[var(--text-tertiary)]">
          These come from the environment, not the database — a deploy owns its own letterhead, so a
          staging copy can never post a real invoice under the real company name.
        </p>
      </Card>

      {/* Account ----------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Your account"
          description={`Signed in as ${session.email}.`}
          action={<UserCog className="size-4 text-[var(--text-tertiary)]" />}
        />
        <p className="px-4 py-3.5 text-sm text-[var(--text-secondary)]">
          This deployment authenticates through Supabase Auth, which owns your password. Change it
          there; Kraken stores no password for you in this mode.
        </p>
      </Card>

      {/* Audit ------------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Recent activity"
          description="Every internal and portal action is appended here and can never be edited or deleted."
          action={<SectionLink href="/app/settings/audit">Audit log</SectionLink>}
        />
        {recent.rows.length === 0 ? (
          <EmptyState
            compact
            icon={ScrollText}
            title="Nothing recorded yet"
            description="The log fills as soon as anything happens — a work item moving, an invoice finalizing, a portal login."
          />
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {recent.rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-2">
                <Badge
                  tone={row.actor_type === "portal" ? "accent" : "neutral"}
                  className="shrink-0"
                >
                  {row.actor_type}
                </Badge>
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text-primary)]">
                  {row.action}
                </code>
                <span className="hidden shrink-0 truncate text-2xs text-[var(--text-tertiary)] sm:block">
                  {row.project_name ?? "—"}
                </span>
                <span className="shrink-0 text-2xs tabular-nums text-[var(--text-tertiary)]">
                  {formatRelative(row.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
