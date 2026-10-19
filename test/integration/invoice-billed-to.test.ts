import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { createClient, createProject, createTimeEntry, createInternalUser, resetDatabase } from "../setup/factories";
import { replaceClientContacts } from "@/lib/data/clients";
import { createDraftInvoice, finalizeInvoice } from "@/lib/invoices/engine";
import { getInvoiceDetail } from "@/lib/data/invoices";

/**
 * A finalized invoice must keep its own copy of who it was billed to: the
 * live client/contact can change afterward without altering history that has
 * already gone out. A draft, by contrast, has no history yet and should track
 * the live primary contact.
 */

let actorId: string;

beforeEach(async () => {
  await resetDatabase();
  actorId = (await createInternalUser()).id;
});

async function invoiceWithContact(name: string) {
  const client = await createClient();
  await replaceClientContacts(client.id, [
    { name, email: `${name.toLowerCase()}@example.com`, is_primary: true },
  ]);
  const project = await createProject({
    client_id: client.id,
    billing_model: "hourly",
    hourly_rate: 100,
  });
  await createTimeEntry(project.id, { hours_worked: 2, hours_billed: 2 });
  const draft = await createDraftInvoice({
    projectId: project.id,
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
    actorId,
  });
  return { client, project, draft };
}

describe("invoice billed-to", () => {
  it("follows the live primary while the invoice is a draft", async () => {
    const { client, draft } = await invoiceWithContact("Dana");
    await replaceClientContacts(client.id, [
      { name: "Sam", email: "sam@example.com", is_primary: true },
    ]);
    const detail = await getInvoiceDetail(draft.id);
    expect(detail?.project.client_contact_name).toBe("Sam");
  });

  it("stops following once finalized", async () => {
    const { client, draft } = await invoiceWithContact("Dana");
    await finalizeInvoice(draft.id, actorId);

    await replaceClientContacts(client.id, [
      { name: "Sam", email: "sam@example.com", is_primary: true },
    ]);

    const detail = await getInvoiceDetail(draft.id);
    expect(detail?.project.client_contact_name).toBe("Dana");
    expect(detail?.project.client_contact_email).toBe("dana@example.com");
  });

  it("records the company name alongside the contact", async () => {
    const { client, draft } = await invoiceWithContact("Dana");
    await finalizeInvoice(draft.id, actorId);
    const rows = await sql<{ bill_to_name: string | null }[]>`
      select bill_to_name from invoices where id = ${draft.id}`;
    expect(rows[0]?.bill_to_name).toBe(client.name);
  });

  it("leaves the snapshot null when no contact is starred", async () => {
    const client = await createClient();
    await replaceClientContacts(client.id, [{ name: "Nobody", email: null, is_primary: false }]);
    const project = await createProject({
      client_id: client.id,
      billing_model: "hourly",
      hourly_rate: 100,
    });
    await createTimeEntry(project.id, { hours_worked: 1, hours_billed: 1 });
    const draft = await createDraftInvoice({
      projectId: project.id,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      actorId,
    });
    await finalizeInvoice(draft.id, actorId);

    // A contact starred *after* finalization must not leak onto a snapshot
    // that recorded no contact -- this is what distinguishes a frozen null
    // from a draft's live (currently empty) follow.
    await replaceClientContacts(client.id, [
      { name: "Sam", email: "sam@example.com", is_primary: true },
    ]);

    const detail = await getInvoiceDetail(draft.id);
    expect(detail?.project.client_contact_name).toBeNull();
    expect(detail?.project.client_contact_email).toBeNull();
    expect(detail?.project.client_name).toBe(client.name);
  });
});
