"use client";

import * as React from "react";
import Form from "next/form";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/field";
import { ACTOR_TYPES, type ActorType } from "@/lib/db/types";

export interface AuditFilterState {
  actorType: ActorType | "";
  actorId: string;
  projectId: string;
  action: string;
  from: string;
  to: string;
}

const ACTOR_LABELS: Record<ActorType, string> = {
  user: "Internal user",
  agent: "Agent (retired)",
  portal: "Client portal",
};

/**
 * Every filter is a URL parameter, so a forensic question — "what happened to
 * Greenhouse on the 3rd?" — is a link someone can be sent. Every change
 * submits the GET form, which drops the page cursor (page 4 of a different
 * query is meaningless); blank fields submit as `x=`, which the page reads as
 * unset. `noValidate`, so a from-date past the to-date still applies.
 */
export function AuditFilters({
  state,
  actions,
  projects,
}: {
  state: AuditFilterState;
  actions: string[];
  projects: { id: string; name: string; client_name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const active = Object.values(state).some(Boolean);
  const submit = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    event.currentTarget.form?.requestSubmit();

  return (
    <Form
      action=""
      scroll={false}
      prefetch={false}
      noValidate
      className="flex flex-wrap items-center gap-2"
    >
      {state.actorId && <input type="hidden" name="actor" value={state.actorId} />}
      <NativeSelect
        name="actor_type"
        aria-label="Filter by actor type"
        value={state.actorType}
        onChange={submit}
        className="h-7 w-auto min-w-[8.5rem] rounded-[var(--radius-sm)] py-0 pl-2 pr-7 text-xs"
      >
        <option value="">Any actor</option>
        {ACTOR_TYPES.map((value) => (
          <option key={value} value={value}>
            {ACTOR_LABELS[value]}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        name="project"
        aria-label="Filter by project"
        value={state.projectId}
        onChange={submit}
        className="h-7 w-auto min-w-[9rem] max-w-[15rem] rounded-[var(--radius-sm)] py-0 pl-2 pr-7 text-xs"
      >
        <option value="">Any project</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.client_name} — {project.name}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        name="action"
        aria-label="Filter by action"
        value={state.action}
        onChange={submit}
        className="h-7 w-auto min-w-[9rem] max-w-[15rem] rounded-[var(--radius-sm)] py-0 pl-2 pr-7 font-mono text-xs"
      >
        <option value="">Any action</option>
        {actions.map((action) => (
          <option key={action} value={action}>
            {action}
          </option>
        ))}
      </NativeSelect>

      <span className="flex items-center gap-1.5">
        <Input
          type="date"
          name="from"
          aria-label="From date"
          value={state.from}
          max={state.to || undefined}
          onChange={submit}
          className="h-7 w-[8.75rem] rounded-[var(--radius-sm)] px-2 text-xs"
        />
        <span className="text-xs text-[var(--text-tertiary)]">to</span>
        <Input
          type="date"
          name="to"
          aria-label="To date"
          value={state.to}
          min={state.from || undefined}
          onChange={submit}
          className="h-7 w-[8.75rem] rounded-[var(--radius-sm)] px-2 text-xs"
        />
      </span>

      {active && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname, { scroll: false })}>
          <X />
          Clear
        </Button>
      )}
    </Form>
  );
}
