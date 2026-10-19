import { describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { getClientContacts, getPrimaryContact, replaceClientContacts } from "@/lib/data/clients";
import { createClient } from "../setup/factories";

describe("client_contacts", () => {
  it("allows many contacts for one client", async () => {
    const client = await createClient();
    await sql`insert into client_contacts (client_id, name, email)
              values (${client.id}, ${"Sam Okafor"}, ${"sam@example.com"})`;
    await sql`insert into client_contacts (client_id, name, email)
              values (${client.id}, ${"Accounts"}, ${"ap@example.com"})`;
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from client_contacts where client_id = ${client.id}`;
    expect(rows[0]?.n).toBe(2);
  });

  it("refuses a second primary for the same client", async () => {
    const client = await createClient();
    await sql`insert into client_contacts (client_id, name, is_primary)
              values (${client.id}, ${"First"}, true)`;
    await expect(
      sql`insert into client_contacts (client_id, name, is_primary)
          values (${client.id}, ${"Second"}, true)`,
    ).rejects.toThrow();
  });

  it("allows a primary for each of two different clients", async () => {
    const a = await createClient();
    const b = await createClient();
    await sql`insert into client_contacts (client_id, name, is_primary)
              values (${a.id}, ${"A"}, true)`;
    await sql`insert into client_contacts (client_id, name, is_primary)
              values (${b.id}, ${"B"}, true)`;
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from client_contacts where is_primary`;
    expect(rows[0]?.n).toBeGreaterThanOrEqual(2);
  });

  it("allows zero primaries", async () => {
    const client = await createClient();
    await sql`insert into client_contacts (client_id, name) values (${client.id}, ${"Nobody"})`;
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from client_contacts
      where client_id = ${client.id} and is_primary`;
    expect(rows[0]?.n).toBe(0);
  });

  it("refuses a contact with a blank name", async () => {
    const client = await createClient();
    await expect(
      sql`insert into client_contacts (client_id, name) values (${client.id}, ${"   "})`,
    ).rejects.toThrow();
  });

  it("removes contacts when the client row is deleted", async () => {
    const client = await createClient();
    await sql`insert into client_contacts (client_id, name) values (${client.id}, ${"Gone"})`;
    await sql`delete from clients where id = ${client.id}`;
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from client_contacts where client_id = ${client.id}`;
    expect(rows[0]?.n).toBe(0);
  });

  it("has row level security enabled", async () => {
    const rows = await sql<{ relrowsecurity: boolean }[]>`
      select relrowsecurity from pg_class
      where relname = 'client_contacts' and relnamespace = 'public'::regnamespace`;
    expect(rows[0]?.relrowsecurity).toBe(true);
  });
});

describe("contacts data layer", () => {
  it("orders primary first, then oldest first", async () => {
    const client = await createClient();
    // Distinct explicit created_at values: a single replaceClientContacts call
    // inserts all rows in one transaction, so they'd share transaction_timestamp()
    // and the "oldest first" ordering wouldn't be exercised at all.
    await sql`insert into client_contacts (client_id, name, is_primary, created_at)
              values (${client.id}, ${"Sam"}, false, now() - interval '2 minutes')`;
    await sql`insert into client_contacts (client_id, name, is_primary, created_at)
              values (${client.id}, ${"Accounts"}, false, now() - interval '1 minute')`;
    await sql`insert into client_contacts (client_id, name, email, is_primary)
              values (${client.id}, ${"Dana"}, ${"dana@example.com"}, true)`;
    const contacts = await getClientContacts(client.id);
    expect(contacts.map((c) => c.name)).toEqual(["Dana", "Sam", "Accounts"]);
  });

  it("returns the primary contact, or null when none is starred", async () => {
    const client = await createClient();
    await replaceClientContacts(client.id, [
      { name: "Sam", email: null, is_primary: false },
    ]);
    expect(await getPrimaryContact(client.id)).toBeNull();

    await replaceClientContacts(client.id, [
      { name: "Dana", email: null, is_primary: true },
    ]);
    expect((await getPrimaryContact(client.id))?.name).toBe("Dana");
  });

  it("replaces the whole set rather than appending", async () => {
    const client = await createClient();
    await replaceClientContacts(client.id, [{ name: "Old", email: null, is_primary: true }]);
    await replaceClientContacts(client.id, [{ name: "New", email: null, is_primary: true }]);
    const contacts = await getClientContacts(client.id);
    expect(contacts.map((c) => c.name)).toEqual(["New"]);
  });

  it("accepts an empty set", async () => {
    const client = await createClient();
    await replaceClientContacts(client.id, [{ name: "Only", email: null, is_primary: true }]);
    await replaceClientContacts(client.id, []);
    expect(await getClientContacts(client.id)).toEqual([]);
    expect(await getPrimaryContact(client.id)).toBeNull();
  });

  it("returns the same order on repeated reads after one replace call", async () => {
    const client = await createClient();
    await replaceClientContacts(client.id, [
      { name: "Sam", email: null, is_primary: false },
      { name: "Dana", email: "dana@example.com", is_primary: true },
      { name: "Accounts", email: null, is_primary: false },
      { name: "Ops", email: null, is_primary: false },
    ]);
    const first = await getClientContacts(client.id);
    const second = await getClientContacts(client.id);
    expect(second.map((c) => c.name)).toEqual(first.map((c) => c.name));
  });
});
