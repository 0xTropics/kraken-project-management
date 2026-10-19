"use client";

import * as React from "react";
import Link from "next/link";
import { Bot, ChevronRight, Globe, User } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/badge";
import { Table, TBody, TH, THead } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { ActorType } from "@/lib/db/types";
import type { AuditRow } from "@/lib/data/audit";

/**
 * The audit log, at forensic density. 32px rows, monospace for anything that
 * is an identifier, and the payload one click away rather than one page away.
 *
 * Read-only by construction: `audit_log` refuses UPDATE and DELETE at the
 * database level, so there is nothing to guard here — only to render clearly.
 */

const ACTOR_META: Record<
  ActorType,
  { label: string; tone: Tone; Icon: React.ComponentType<{ className?: string }> }
> = {
  user: { label: "User", tone: "neutral", Icon: User },
  agent: { label: "Agent", tone: "neutral", Icon: Bot },
  portal: { label: "Portal", tone: "accent", Icon: Globe },
};

function payloadText(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return "// payload could not be serialised";
  }
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Table label="Audit log" className="min-w-[44rem]">
      <THead>
        <tr>
          <th scope="col" className="relative h-8 w-8">
            <span className="sr-only">Expand</span>
          </th>
          <TH className="w-[11rem] px-2">When</TH>
          <TH className="w-[13rem] px-2">Actor</TH>
          <TH className="px-2">Action</TH>
          <TH className="w-[12rem] px-2">Project</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => {
          const actor = ACTOR_META[row.actor_type];
          const open = expanded.has(row.id);
          const hasPayload = row.payload && Object.keys(row.payload).length > 0;
          return (
            <React.Fragment key={row.id}>
              <tr
                className={cn(
                  "transition-colors duration-75",
                  open ? "bg-[var(--bg-hover)]" : "hover:bg-[var(--bg-hover)]",
                )}
              >
                <td className="w-8 px-0 align-middle">
                  <button
                    type="button"
                    onClick={() => toggle(row.id)}
                    aria-expanded={open}
                    aria-label={open ? "Hide payload" : "Show payload"}
                    className="grid h-8 w-8 place-items-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  >
                    <ChevronRight
                      className={cn(
                        "size-3.5 transition-transform duration-150",
                        open && "rotate-90",
                        !hasPayload && "opacity-40",
                      )}
                    />
                  </button>
                </td>
                <td className="h-8 whitespace-nowrap px-2 align-middle tabular-nums text-[var(--text-secondary)]">
                  {formatDateTime(row.created_at)}
                </td>
                <td className="h-8 max-w-[13rem] px-2 align-middle">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Badge tone={actor.tone}>
                      <actor.Icon />
                      {actor.label}
                    </Badge>
                    {row.actor_label && (
                      <span className="truncate text-xs text-[var(--text-tertiary)]">
                        {row.actor_label}
                      </span>
                    )}
                  </span>
                </td>
                <td className="h-8 px-2 align-middle">
                  <span className="font-mono text-xs text-[var(--text-primary)]">
                    {row.action}
                  </span>
                  {row.entity_type && (
                    <span className="ml-2 text-2xs text-[var(--text-tertiary)]">
                      {row.entity_type}
                    </span>
                  )}
                </td>
                <td className="h-8 max-w-[12rem] truncate px-2 align-middle text-[var(--text-secondary)]">
                  {row.project_slug ? (
                    <Link
                      href={`/app/projects/${row.project_slug}`}
                      className="hover:text-[var(--accent-text)]"
                    >
                      {row.project_name}
                    </Link>
                  ) : (
                    <span className="text-[var(--text-tertiary)]">—</span>
                  )}
                </td>
              </tr>
              {open && (
                <tr className="bg-[var(--bg-sunken)]">
                  <td colSpan={5} className="px-2 py-2">
                    <dl className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-2xs text-[var(--text-tertiary)]">
                      <div className="flex gap-1.5">
                        <dt>entry</dt>
                        <dd className="font-mono text-[var(--text-secondary)]">{row.id}</dd>
                      </div>
                      {row.entity_id && (
                        <div className="flex gap-1.5">
                          <dt>{row.entity_type ?? "entity"}</dt>
                          <dd className="font-mono text-[var(--text-secondary)]">
                            {row.entity_id}
                          </dd>
                        </div>
                      )}
                      {row.actor_id && (
                        <div className="flex gap-1.5">
                          <dt>actor</dt>
                          <dd className="font-mono text-[var(--text-secondary)]">
                            {row.actor_id}
                          </dd>
                        </div>
                      )}
                    </dl>
                    <pre tabIndex={0} className="scroll-thin overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-2.5 font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
                      <code>{hasPayload ? payloadText(row.payload) : "{}"}</code>
                    </pre>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </TBody>
    </Table>
  );
}
