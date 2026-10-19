import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import {
  createProject,
  createTimeEntry,
  createWorkItem,
  resetDatabase,
} from "../setup/factories";

/**
 * The schema's own guards, exercised directly against Postgres with the same
 * privileges the application connects with. If these pass only because the API
 * layer refused first, they are not testing anything -- so every case here
 * bypasses the API entirely and issues raw SQL.
 */

beforeEach(resetDatabase);

describe("audit_log is append-only", () => {
  it("accepts inserts", async () => {
    await sql`insert into audit_log (actor_type, action) values ('user', 'test.action')`;
    const rows = await sql`select * from audit_log`;
    expect(rows).toHaveLength(1);
  });

  it("refuses UPDATE even for the owning role", async () => {
    await sql`insert into audit_log (actor_type, action) values ('agent', 'work_item.create')`;
    await expect(
      sql`update audit_log set action = 'work_item.delete'`,
    ).rejects.toThrow(/append_only/i);
  });

  it("refuses DELETE even for the owning role", async () => {
    await sql`insert into audit_log (actor_type, action) values ('agent', 'work_item.create')`;
    await expect(sql`delete from audit_log`).rejects.toThrow(/append_only/i);
    expect(await sql`select count(*)::int as n from audit_log`).toEqual([{ n: 1 }]);
  });
});

describe("the agent integration is gone from the schema", () => {
  it("work_item_status is exactly the five board states", async () => {
    const rows = await sql<{ v: string }[]>`
      select unnest(enum_range(null::work_item_status))::text as v
    `;
    expect(rows.map((r) => r.v)).toEqual(["backlog", "planned", "in_progress", "done", "wont_do"]);
  });

  it("has no agent tables, types, columns or triggers", async () => {
    const [row] = await sql<{ tokens: string | null; source_type: number; cols: number; trig: number }[]>`
      select
        to_regclass('public.agent_tokens')::text as tokens,
        (select count(*)::int from pg_type where typname = 'content_source') as source_type,
        (select count(*)::int from information_schema.columns
          where table_schema = 'public'
            and ((table_name in ('work_items','progress_notes') and column_name = 'source')
              or (table_name = 'project_notes' and column_name = 'agent_readable'))) as cols,
        (select count(*)::int from pg_trigger where tgname = 'work_items_agent_done_guard') as trig
    `;
    if (!row) throw new Error("schema probe returned no row");
    expect(row).toEqual({ tokens: null, source_type: 0, cols: 0, trig: 0 });
  });

  it("still derives completed_at when an item reaches done", async () => {
    const project = await createProject();
    const item = await createWorkItem(project.id, { status: "in_progress" });
    await sql`update work_items set status = 'done' where id = ${item.id}`;
    const [after] = await sql<{ completed_at: string | null }[]>`
      select completed_at from work_items where id = ${item.id}
    `;
    if (!after) throw new Error("item vanished");
    expect(after.completed_at).not.toBeNull();
  });

  it("keeps the 'agent' audit actor so history stays readable", async () => {
    await sql`insert into audit_log (actor_type, action) values ('agent', 'work_item.create')`;
    expect(await sql`select count(*)::int as n from audit_log where actor_type = 'agent'`).toEqual([{ n: 1 }]);
  });
});

describe("finalized invoices are immutable", () => {
  async function finalizedInvoice() {
    const project = await createProject();
    const [invoice] = await sql<{ id: string }[]>`
      insert into invoices (project_id, number, status, period_start, period_end,
                            currency, subtotal, tax_amount, total, finalized_at, sent_at)
      values (${project.id}, '2026-001', 'sent', '2026-03-01', '2026-03-31',
              'USD', 1000, 0, 1000, now(), now())
      returning id
    `;
    return { project, invoiceId: invoice.id };
  }

  it("refuses to change the total", async () => {
    const { invoiceId } = await finalizedInvoice();
    await expect(
      sql`update invoices set total = 1 where id = ${invoiceId}`,
    ).rejects.toThrow(/invoice_immutable/);
  });

  it("refuses to change the number or the period", async () => {
    const { invoiceId } = await finalizedInvoice();
    await expect(
      sql`update invoices set number = '2026-999' where id = ${invoiceId}`,
    ).rejects.toThrow(/invoice_immutable/);
    await expect(
      sql`update invoices set period_end = '2026-04-30' where id = ${invoiceId}`,
    ).rejects.toThrow(/invoice_immutable/);
  });

  it("refuses to walk back to draft", async () => {
    const { invoiceId } = await finalizedInvoice();
    await expect(
      sql`update invoices set status = 'draft' where id = ${invoiceId}`,
    ).rejects.toThrow(/invoice_cannot_return_to_draft/);
  });

  it("refuses to delete anything other than a draft", async () => {
    const { invoiceId } = await finalizedInvoice();
    await expect(sql`delete from invoices where id = ${invoiceId}`).rejects.toThrow(
      /invoice_immutable/,
    );
  });

  it("still allows the paid and publish transitions", async () => {
    const { invoiceId } = await finalizedInvoice();
    await sql`
      update invoices set status = 'paid', payment_method = 'crypto',
                          payment_note = '0xabc', paid_at = now(), published_at = now()
      where id = ${invoiceId}
    `;
    const [after] = await sql<{ status: string }[]>`
      select status from invoices where id = ${invoiceId}
    `;
    expect(after.status).toBe("paid");
  });

  it("refuses to add, edit, or remove lines once finalized", async () => {
    const { invoiceId } = await finalizedInvoice();
    await expect(
      sql`insert into invoice_lines (invoice_id, kind, description, quantity, unit_amount, amount)
          values (${invoiceId}, 'adhoc', 'Extra', 1, 500, 500)`,
    ).rejects.toThrow(/invoice_immutable/);
  });

  it("void is terminal", async () => {
    const { invoiceId } = await finalizedInvoice();
    await sql`update invoices set status = 'void', voided_at = now() where id = ${invoiceId}`;
    await expect(
      sql`update invoices set status = 'paid', payment_method = 'cash' where id = ${invoiceId}`,
    ).rejects.toThrow(/invoice_void_is_terminal/);
  });
});

describe("time entries lock to their invoice", () => {
  async function lockedEntry() {
    const project = await createProject();
    const entry = await createTimeEntry(project.id);
    const [invoice] = await sql<{ id: string }[]>`
      insert into invoices (project_id, number, status, period_start, period_end,
                            currency, subtotal, tax_amount, total, finalized_at)
      values (${project.id}, '2026-002', 'sent', '2026-03-01', '2026-03-31',
              'USD', 450, 0, 450, now())
      returning id
    `;
    await sql`update time_entries set invoice_id = ${invoice.id} where id = ${entry.id}`;
    return { entryId: entry.id, invoiceId: invoice.id };
  }

  it("refuses edits to a locked entry", async () => {
    const { entryId } = await lockedEntry();
    await expect(
      sql`update time_entries set hours_billed = 0 where id = ${entryId}`,
    ).rejects.toThrow(/time_entry_locked/);
  });

  it("refuses deletion of a locked entry", async () => {
    const { entryId } = await lockedEntry();
    await expect(sql`delete from time_entries where id = ${entryId}`).rejects.toThrow(
      /time_entry_locked/,
    );
  });

  it("releases entries only inside the void path", async () => {
    const { entryId, invoiceId } = await lockedEntry();
    await sql.begin(async (tx) => {
      await tx`select set_config('kraken.unlock_invoice', ${invoiceId}, true)`;
      await tx`update time_entries set invoice_id = null where id = ${entryId}`;
    });
    const [after] = await sql<{ invoice_id: string | null }[]>`
      select invoice_id from time_entries where id = ${entryId}
    `;
    expect(after.invoice_id).toBeNull();
  });

  it("does not release entries under a different invoice's unlock token", async () => {
    const { entryId } = await lockedEntry();
    await expect(
      sql.begin(async (tx) => {
        await tx`select set_config('kraken.unlock_invoice', ${"00000000-0000-0000-0000-000000000000"}, true)`;
        await tx`update time_entries set invoice_id = null where id = ${entryId}`;
      }),
    ).rejects.toThrow(/time_entry_locked/);
  });
});

describe("data invariants", () => {
  it("refuses hours_billed greater than hours_worked", async () => {
    const project = await createProject();
    await expect(
      createTimeEntry(project.id, { hours_worked: 2, hours_billed: 3 }),
    ).rejects.toThrow(/billed_lte_worked/);
  });

  it("refuses an hourly project without a rate", async () => {
    await expect(
      sql`insert into projects (client_id, name, slug, billing_model, portal_password_hash)
          values (${(await createProject()).client_id}, 'X', 'x-no-rate', 'hourly', 'h')`,
    ).rejects.toThrow(/hourly_needs_rate/);
  });

  it("keeps project slugs unique", async () => {
    await createProject({ slug: "acme-portal" });
    await expect(createProject({ slug: "acme-portal" })).rejects.toThrow(/duplicate key/);
  });
});
