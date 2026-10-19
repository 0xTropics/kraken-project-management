"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { ApiRequestError, api, fieldErrors } from "@/lib/client-api";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import type { ProjectWithClient } from "@/lib/data/projects";
import type { ProjectStatus } from "@/lib/db/types";
import { BillingFields, billingBody, type BillingValues } from "@/components/projects/billing-fields";
import { maintenanceValuesFrom } from "@/lib/projects/maintenance-form";

// Flattened on purpose: the dirty check compares each key with `!==`, and a
// nested billing object would always read as changed.
interface FormState extends BillingValues {
  name: string;
  description: string;
  status: ProjectStatus;
  repo_url: string;
  started_at: string;
}

function toState(project: ProjectWithClient): FormState {
  return {
    name: project.name,
    description: project.description ?? "",
    status: project.status,
    billing_model: project.billing_model,
    currency: project.currency,
    hourly_rate: project.hourly_rate === null ? "" : String(project.hourly_rate),
    retainer_amount: project.retainer_amount === null ? "" : String(project.retainer_amount),
    tax_percent: String(Math.round(project.tax_rate * 10000) / 100),
    payment_instructions: project.payment_instructions ?? "",
    retainer_show_hours: project.retainer_show_hours,
    repo_url: project.repo_url ?? "",
    started_at: project.started_at ?? "",
    ...maintenanceValuesFrom(project),
  };
}

/**
 * Everything about a project that is safe to change after creation.
 *
 * The caller keys this component on `project.updated_at`, so a successful save
 * remounts it with the server's row rather than syncing props into state.
 */
export function SettingsForm({ project }: { project: ProjectWithClient }) {
  const router = useRouter();
  const initial = toState(project);
  const [form, setForm] = React.useState<FormState>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, startSaving] = React.useTransition();

  const dirty = (Object.keys(initial) as (keyof FormState)[]).some(
    (key) => form[key] !== initial[key],
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    startSaving(async () => {
      try {
        await api(`/api/internal/projects/${project.id}`, {
          method: "PATCH",
          body: {
            name: form.name.trim(),
            description: form.description,
            status: form.status,
            ...billingBody(form),
            repo_url: form.repo_url,
            started_at: form.started_at === "" ? null : form.started_at,
          },
        });
        toast.success("Project updated.");
        router.refresh();
      } catch (error) {
        if (error instanceof ApiRequestError) {
          setErrors(fieldErrors(error));
          if (!error.body.issues?.length) toast.error(error.message);
        } else {
          toast.error("Could not save those changes");
        }
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-9">
      <section className="space-y-4">
        <SectionTitle>Project</SectionTitle>

        <Field label="Name" htmlFor="s_name" required error={errors.name}>
          <Input
            id="s_name"
            value={form.name}
            required
            maxLength={160}
            aria-invalid={errors.name ? true : undefined}
            onChange={(event) => set("name", event.target.value)}
          />
        </Field>

        <Field
          label="Description"
          htmlFor="s_description"
          error={errors.description}
          hint="The scope summary at the top of the client portal."
        >
          <Textarea
            id="s_description"
            value={form.description}
            rows={3}
            maxLength={4000}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>

        <div className="grid gap-4 grid-cols-[minmax(0,1fr)] sm:grid-cols-2">
          <Field
            label="Status"
            htmlFor="s_status"
            error={errors.status}
            hint="Paused and completed projects stay in the portal; archiving closes it."
          >
            <NativeSelect
              id="s_status"
              value={form.status}
              onChange={(event) => set("status", event.target.value as ProjectStatus)}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              {project.status === "archived" && <option value="archived">Archived</option>}
            </NativeSelect>
          </Field>

          <Field label="Start date" htmlFor="s_started_at" error={errors.started_at}>
            <Input
              id="s_started_at"
              type="date"
              value={form.started_at}
              onChange={(event) => set("started_at", event.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Repository URL"
          htmlFor="s_repo_url"
          error={errors.repo_url}
          hint="Internal only. Never shown in the portal."
        >
          <Input
            id="s_repo_url"
            type="url"
            value={form.repo_url}
            maxLength={500}
            placeholder="https://github.com/you/project"
            onChange={(event) => set("repo_url", event.target.value)}
          />
        </Field>

        <Field
          label="Client"
          htmlFor="s_client"
          hint="Reassigning a project to another client is not supported."
        >
          <Input id="s_client" value={project.client_name} readOnly disabled />
        </Field>
      </section>

      <BillingFields
        editing
        values={form}
        errors={errors}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
      />

      {errors._form && (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] bg-[var(--danger-subtle)] px-3 py-2 text-xs text-[var(--danger)]"
        >
          {errors._form}
        </p>
      )}

      <div
        className={cn(
          "sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-[var(--border-subtle)]",
          "bg-[var(--bg-app)] px-4 py-3 md:-mx-6 md:px-6",
        )}
      >
        <span className="mr-auto text-2xs text-[var(--text-tertiary)]">
          {dirty ? "Unsaved changes" : "Everything saved"}
        </span>
        <Button variant="ghost" size="md" disabled={!dirty || saving} onClick={() => setForm(initial)}>
          Discard
        </Button>
        <Button type="submit" variant="primary" size="md" disabled={!dirty || saving}>
          {saving && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
