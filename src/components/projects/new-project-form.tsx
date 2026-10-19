"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Modal, ModalContent } from "@/components/ui/modal";
import { api, fieldErrors } from "@/lib/client-api";
import { slugify, today } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { ClientOption } from "@/lib/data/projects";
import { BLANK_BILLING, BillingFields, billingBody } from "@/components/projects/billing-fields";
import { PortalPasswordInput } from "@/components/projects/portal-password-input";

interface CreatedProject {
  project: { slug: string; name: string } | null;
}

/**
 * Project creation. Everything a project needs to exist is on one
 * screen, including the portal password — it is required at creation,
 * so there is deliberately no "add it later" path.
 */
export function NewProjectForm({
  clients,
  takenSlugs,
}: {
  clients: ClientOption[];
  takenSlugs: string[];
}) {
  const router = useRouter();

  const [clientOptions, setClientOptions] = React.useState(clients);
  const [clientId, setClientId] = React.useState(clients[0]?.id ?? "");
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [description, setDescription] = React.useState("");

  const [billing, setBilling] = React.useState(BLANK_BILLING);
  const [portalPassword, setPortalPassword] = React.useState("");

  const [repoUrl, setRepoUrl] = React.useState("");
  const [startedAt, setStartedAt] = React.useState(today());

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startPending] = React.useTransition();
  const [newClientOpen, setNewClientOpen] = React.useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);
  const slugShapeOk = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(effectiveSlug) && effectiveSlug.length >= 2;
  const slugTaken = takenSlugs.includes(effectiveSlug);

  const slugHint = !effectiveSlug
    ? "Derived from the name — /portal/your-project"
    : !slugShapeOk
      ? "Lowercase letters, numbers and hyphens, at least two characters."
      : slugTaken
        ? "Another project already uses this slug."
        : null;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const body = {
      client_id: clientId,
      name: name.trim(),
      slug: effectiveSlug,
      description,
      ...billingBody(billing),
      portal_password: portalPassword,
      repo_url: repoUrl,
      started_at: startedAt === "" ? null : startedAt,
    };

    startPending(async () => {
      try {
        const result = await api<CreatedProject>("/api/internal/projects", {
          method: "POST",
          body,
        });
        const created = result.project;
        router.push(created ? `/app/projects/${created.slug}` : "/app/projects");
        router.refresh();
      } catch (error) {
        setErrors(fieldErrors(error));
      }
    });
  }

  async function createClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React bubbles a portal's events through the component tree, so without
    // this the project form around the dialog would submit too.
    event.stopPropagation();
    const data = new FormData(event.currentTarget);
    const contactName = String(data.get("contact_name") ?? "").trim();
    const contactEmail = String(data.get("contact_email") ?? "").trim();
    try {
      const { client } = await api<{ client: { id: string; name: string } }>(
        "/api/internal/clients",
        {
          method: "POST",
          body: {
            name: String(data.get("name") ?? ""),
            // A blank name would fail the contact schema's own validation, so
            // only send a contact when one was actually entered. The one
            // contact this quick form can create is naturally the primary.
            contacts: contactName
              ? [{ name: contactName, email: contactEmail, is_primary: true }]
              : [],
          },
        },
      );
      setClientOptions((current) =>
        [...current, { id: client.id, name: client.name }].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setClientId(client.id);
      setNewClientOpen(false);
      router.refresh();
    } catch (error) {
      setErrors((current) => ({ ...current, client_id: fieldErrors(error)._form ?? "Could not create that client" }));
      setNewClientOpen(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-9">
      {/* Basics ------------------------------------------------------------ */}
      <section className="space-y-4">
        <SectionTitle>Basics</SectionTitle>

        <Field label="Project name" htmlFor="name" required error={errors.name}>
          <Input
            id="name"
            value={name}
            autoFocus
            required
            maxLength={160}
            placeholder="Greenhouse operations dashboard"
            aria-invalid={errors.name ? true : undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field
          label="Client"
          htmlFor="client_id"
          required
          error={errors.client_id}
          hint="Who this work is billed to. They own the portal."
        >
          <div className="flex items-center gap-2">
            <NativeSelect
              id="client_id"
              value={clientId}
              required
              className="min-w-0 flex-1"
              onChange={(event) => setClientId(event.target.value)}
            >
              <option value="" disabled>
                Choose a client…
              </option>
              {clientOptions.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </NativeSelect>
            <Button
              variant="secondary"
              size="md"
              className="shrink-0"
              aria-label="Create a new client"
              onClick={() => setNewClientOpen(true)}
            >
              <Plus />
              <span className="hidden sm:inline">New client</span>
            </Button>
          </div>
        </Field>

        <Field
          label="Slug"
          htmlFor="slug"
          required
          error={errors.slug ?? (slugTaken || (effectiveSlug !== "" && !slugShapeOk) ? slugHint : null)}
          hint={
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="text-[var(--text-tertiary)]">The portal lives at</span>
              <code className="rounded-[var(--radius-xs)] bg-[var(--bg-inset)] px-1 py-px font-mono text-2xs text-[var(--text-secondary)]">
                /portal/{effectiveSlug || "…"}
              </code>
              {effectiveSlug !== "" && slugShapeOk && !slugTaken && (
                <span className="font-medium text-[var(--success)]">Available</span>
              )}
            </span>
          }
        >
          <Input
            id="slug"
            value={effectiveSlug}
            required
            maxLength={60}
            spellCheck={false}
            className="font-mono text-sm"
            aria-invalid={slugTaken || (effectiveSlug !== "" && !slugShapeOk) ? true : undefined}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(slugify(event.target.value));
            }}
          />
        </Field>

        <Field
          label="Description"
          htmlFor="description"
          error={errors.description}
          hint="A scope summary. The client reads this at the top of their portal."
        >
          <Textarea
            id="description"
            value={description}
            rows={3}
            maxLength={4000}
            placeholder="What this project covers, in a sentence or two."
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </section>

      {/* Billing ----------------------------------------------------------- */}
      <BillingFields
        values={billing}
        errors={errors}
        onChange={(patch) => setBilling((current) => ({ ...current, ...patch }))}
      />

      {/* Portal ------------------------------------------------------------ */}
      <section className="space-y-4">
        <SectionTitle>Client portal</SectionTitle>

        <p className="max-w-prose text-sm leading-relaxed text-[var(--text-secondary)]">
          A project cannot exist without a portal password. This is the single
          password your client types at{" "}
          <code className="rounded-[var(--radius-xs)] bg-[var(--bg-inset)] px-1 py-px font-mono text-2xs">
            /portal/{effectiveSlug || "…"}
          </code>{" "}
          — there are no client accounts. Send it to them however you normally
          reach them. You can rotate it later from Settings, which immediately
          signs out every open portal session.
        </p>

        <Field
          label="Portal password"
          htmlFor="portal_password"
          required
          error={errors.portal_password}
          hint="At least 10 characters. Kraken stores only an argon2id hash — it can never show you this again."
        >
          <PortalPasswordInput
            id="portal_password"
            value={portalPassword}
            onChange={setPortalPassword}
            invalid={Boolean(errors.portal_password)}
          />
        </Field>
      </section>

      {/* Details ----------------------------------------------------------- */}
      <section className="space-y-4">
        <SectionTitle>Details</SectionTitle>
        <div className="grid gap-4 grid-cols-[minmax(0,1fr)] sm:grid-cols-2">
          <Field
            label="Repository URL"
            htmlFor="repo_url"
            error={errors.repo_url}
            hint="Internal only. Never shown in the portal."
          >
            <Input
              id="repo_url"
              value={repoUrl}
              type="url"
              maxLength={500}
              placeholder="https://github.com/you/project"
              onChange={(event) => setRepoUrl(event.target.value)}
            />
          </Field>
          <Field label="Start date" htmlFor="started_at" error={errors.started_at}>
            <Input
              id="started_at"
              value={startedAt}
              type="date"
              onChange={(event) => setStartedAt(event.target.value)}
            />
          </Field>
        </div>
      </section>

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
        <Button asChild variant="ghost" size="md">
          <Link href="/app/projects">Cancel</Link>
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={pending || clientOptions.length === 0}
        >
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Creating" : "Create project"}
        </Button>
      </div>

      <Modal open={newClientOpen} onOpenChange={setNewClientOpen}>
        <ModalContent
          title="New client"
          description="Just enough to invoice them. You can fill in the rest later."
          size="sm"
        >
          <form id="inline-client" onSubmit={createClient} className="space-y-4 pb-4">
            <Field label="Name" htmlFor="inline_client_name" required>
              <Input id="inline_client_name" name="name" required autoFocus maxLength={160} />
            </Field>
            <Field label="Contact name" htmlFor="inline_contact_name">
              <Input id="inline_contact_name" name="contact_name" maxLength={160} />
            </Field>
            <Field label="Contact email" htmlFor="inline_contact_email">
              <Input id="inline_contact_email" name="contact_email" type="email" maxLength={160} />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="md" onClick={() => setNewClientOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md">
                Add client
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>
    </form>
  );
}
