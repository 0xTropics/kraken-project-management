"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
import { ApiRequestError, api, fieldErrors, run } from "@/lib/client-api";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import type { Client, ClientContact } from "@/lib/db/types";

interface ContactRow {
  key: string; // crypto.randomUUID() for new rows, or the row's db id — for React keys only, never sent
  name: string;
  email: string;
  is_primary: boolean;
}

interface FormState {
  name: string;
  notes: string;
  contacts: ContactRow[];
}

const BLANK: FormState = { name: "", notes: "", contacts: [] };

/**
 * One form for both creating and editing a client. A client is a small record —
 * the interesting things (projects, money) hang off it rather than living in it.
 *
 * The detail page keys this on `client.updated_at`, so a save remounts it
 * against the freshly written row instead of syncing props into state.
 */
export function ClientForm({ client, contacts }: { client?: Client; contacts?: ClientContact[] }) {
  const router = useRouter();
  // Memoized so `initial.contacts` keeps one identity across re-renders within
  // a mount — otherwise every render's fresh `.map()` array would fail the
  // dirty check's reference comparison and "Unsaved changes" would never clear.
  const initialContacts = React.useMemo<ContactRow[]>(
    () =>
      (contacts ?? []).map((c) => ({
        key: c.id,
        name: c.name,
        email: c.email ?? "",
        is_primary: c.is_primary,
      })),
    [contacts],
  );
  const initial: FormState = client
    ? { name: client.name, notes: client.notes ?? "", contacts: initialContacts }
    : BLANK;
  const [form, setForm] = React.useState<FormState>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, startSaving] = React.useTransition();
  const [confirmArchive, setConfirmArchive] = React.useState(false);
  const archived = client?.archived_at != null;

  const dirty = (Object.keys(initial) as (keyof FormState)[]).some(
    (key) => form[key] !== initial[key],
  );

  function set<K extends "name" | "notes">(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addContact() {
    setForm((current) => ({
      ...current,
      contacts: [
        ...current.contacts,
        {
          key: crypto.randomUUID(),
          name: "",
          email: "",
          is_primary: current.contacts.length === 0,
        },
      ],
    }));
  }

  function updateContact(key: string, patch: Partial<Pick<ContactRow, "name" | "email">>) {
    setForm((current) => ({
      ...current,
      contacts: current.contacts.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    }));
  }

  /** Only one contact can be primary — the database enforces it, so the form must too. */
  function setPrimary(key: string) {
    setForm((current) => ({
      ...current,
      contacts: current.contacts.map((c) => ({ ...c, is_primary: c.key === key })),
    }));
  }

  function removeContact(key: string) {
    setForm((current) => {
      const removed = current.contacts.find((c) => c.key === key);
      if (!removed) return current;
      const next = current.contacts.filter((c) => c.key !== key);
      // Promote the first remaining row, full stop — not "whichever row
      // lands in the removed row's old slot". Starring doesn't reorder the
      // array (it only flips flags), so the primary can be starred anywhere
      // in the list, not just row 0; always promoting `next[0]` is what keeps
      // this correct once the removed row wasn't at the top.
      if (removed.is_primary && next.length > 0) {
        next[0] = { ...next[0]!, is_primary: true };
      }
      return { ...current, contacts: next };
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const body = {
      name: form.name.trim(),
      notes: form.notes,
      contacts: form.contacts.map(({ name, email, is_primary }) => ({ name, email, is_primary })),
    };
    startSaving(async () => {
      try {
        if (client) {
          await api(`/api/internal/clients/${client.id}`, { method: "PATCH", body });
          toast.success("Client updated.");
          router.refresh();
        } else {
          const created = await api<{ client: Client }>("/api/internal/clients", {
            method: "POST",
            body,
          });
          router.push(`/app/clients/${created.client.id}`);
          router.refresh();
        }
      } catch (error) {
        if (error instanceof ApiRequestError) {
          setErrors(fieldErrors(error));
          if (!error.body.issues?.length) toast.error(error.message);
        } else {
          toast.error("Could not save that client");
        }
      }
    });
  }

  function setArchived(next: boolean) {
    if (!client) return;
    startSaving(async () => {
      const result = await run(
        api(`/api/internal/clients/${client.id}`, { method: "PATCH", body: { archived: next } }),
        {
          success: next ? "Client archived." : "Client restored.",
          error: next
            ? "Could not archive that client"
            : "Could not restore that client",
        },
      );
      if (result !== null) {
        setConfirmArchive(false);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <SectionTitle>{client ? "Details" : "New client"}</SectionTitle>

      <Field label="Name" htmlFor="c_name" required error={errors.name}>
        <Input
          id="c_name"
          value={form.name}
          required
          autoFocus={!client}
          maxLength={160}
          placeholder="Halcyon Foods"
          aria-invalid={errors.name ? true : undefined}
          onChange={(event) => set("name", event.target.value)}
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)]">
          Contacts
        </legend>

        {errors.contacts && (
          <p role="alert" className="text-xs text-[var(--danger)]">
            {errors.contacts}
          </p>
        )}

        {form.contacts.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">
            No contacts yet. Without one, invoices bill to the company name alone.
          </p>
        ) : (
          <ul className="space-y-2">
            {form.contacts.map((contact, index) => {
              const contactLabel = contact.name.trim() || `contact ${index + 1}`;
              return (
              <li
                key={contact.key}
                className="flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3"
              >
                <div className="grid min-w-0 flex-1 gap-2 grid-cols-[minmax(0,1fr)] sm:grid-cols-2">
                  <Field
                    label="Name"
                    htmlFor={`contact_name_${contact.key}`}
                    error={errors[`contacts.${index}.name`]}
                  >
                    <Input
                      id={`contact_name_${contact.key}`}
                      value={contact.name}
                      maxLength={160}
                      placeholder="Dana Whitfield"
                      aria-invalid={errors[`contacts.${index}.name`] ? true : undefined}
                      onChange={(event) => updateContact(contact.key, { name: event.target.value })}
                    />
                  </Field>
                  <Field
                    label="Email"
                    htmlFor={`contact_email_${contact.key}`}
                    error={errors[`contacts.${index}.email`]}
                  >
                    <Input
                      id={`contact_email_${contact.key}`}
                      type="email"
                      value={contact.email}
                      maxLength={160}
                      placeholder="dana@halcyon.example"
                      aria-invalid={errors[`contacts.${index}.email`] ? true : undefined}
                      onChange={(event) => updateContact(contact.key, { email: event.target.value })}
                    />
                  </Field>
                </div>
                <div className="flex shrink-0 items-center gap-1 pt-5">
                  <IconButton
                    label={`Make ${contactLabel} the primary contact`}
                    aria-pressed={contact.is_primary}
                    variant={contact.is_primary ? "secondary" : "ghost"}
                    size="md"
                    onClick={() => setPrimary(contact.key)}
                  >
                    <Star className={contact.is_primary ? "fill-current" : undefined} />
                  </IconButton>
                  <IconButton
                    label={`Remove ${contactLabel}`}
                    variant="ghost"
                    size="md"
                    onClick={() => removeContact(contact.key)}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              </li>
              );
            })}
          </ul>
        )}

        <Button variant="secondary" size="sm" onClick={addContact}>
          <Plus />
          Add contact
        </Button>
      </fieldset>

      <Field
        label="Internal notes"
        htmlFor="c_notes"
        error={errors.notes}
        hint="Never leaves Kraken. Not shown in any portal or on any invoice."
      >
        <Textarea
          id="c_notes"
          value={form.notes}
          rows={4}
          placeholder="How they like to be invoiced, who signs off, anything worth remembering."
          onChange={(event) => set("notes", event.target.value)}
        />
      </Field>

      {errors._form && (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] bg-[var(--danger-subtle)] px-3 py-2 text-xs text-[var(--danger)]"
        >
          {errors._form}
        </p>
      )}

      <div className={cn("flex flex-wrap items-center gap-2 pt-1")}>
        {client ? (
          <>
            <span className="mr-auto text-2xs text-[var(--text-tertiary)]">
              {dirty ? "Unsaved changes" : "Everything saved"}
            </span>
            <Button
              variant="ghost"
              size="md"
              disabled={!dirty || saving}
              onClick={() => setForm(initial)}
            >
              Discard
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={!dirty || saving}>
              {saving && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </>
        ) : (
          <>
            <Button asChild variant="ghost" size="md" className="mr-auto">
              <Link href="/app/clients">Cancel</Link>
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Create client
            </Button>
          </>
        )}
      </div>

      {client && (
        <div className="mt-6 flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4">
          <div className="min-w-0">
            <p className="text-base font-medium text-[var(--text-primary)]">
              {archived ? "This client is archived" : "Archive this client"}
            </p>
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-[var(--text-tertiary)]">
              {archived
                ? "Archived clients are hidden from lists and cannot be picked for a new project. Their projects and invoices are untouched."
                : "Clients are never deleted — projects and invoices reference them. Archiving hides the client from lists and from the new-project picker."}
            </p>
          </div>
          {archived ? (
            <Button
              variant="secondary"
              size="md"
              className="shrink-0"
              disabled={saving}
              onClick={() => setArchived(false)}
            >
              <ArchiveRestore />
              Restore
            </Button>
          ) : (
            <Button
              variant="danger-ghost"
              size="md"
              className="shrink-0"
              onClick={() => setConfirmArchive(true)}
            >
              <Archive />
              Archive
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archive this client?"
        description={client ? `"${client.name}" will be hidden from every list.` : undefined}
        confirmLabel="Archive client"
        busy={saving}
        onConfirm={() => setArchived(true)}
      >
        <p className="pb-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          Existing projects keep running and their portals stay open. You can restore
          the client from this page at any time.
        </p>
      </ConfirmDialog>
    </form>
  );
}
