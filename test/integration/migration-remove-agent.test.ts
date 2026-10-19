import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Migration 001300 swaps the `work_item_status` type. PL/pgSQL caches a plan
 * per session, and a session that fired `work_items_sync_completed_at()` before
 * the swap keeps a plan that names the dropped type -- every later write to
 * `work_items` on that connection fails with "cache lookup failed for type".
 * In production that is a pooled connection on a live Vercel instance at the
 * moment the migration is applied, so the migration must leave every
 * session able to write. This rebuilds the pre-migration schema in its own
 * database, holds a connection across the migration, and writes on it again.
 */

const TARGET = "20261004001300_remove_agent_integration.sql";
const dir = path.join(process.cwd(), "supabase", "migrations");
const adminUrl = new URL(process.env.DATABASE_URL ?? "");
adminUrl.pathname = "/postgres";
const dbName = `kraken_mig_${randomBytes(4).toString("hex")}`;
const dbUrl = new URL(adminUrl);
dbUrl.pathname = `/${dbName}`;

const opts = { prepare: false, max: 1, onnotice: () => {} } as const;
let held: postgres.Sql;
let migrator: postgres.Sql;

beforeAll(async () => {
  const admin = postgres(adminUrl.toString(), opts);
  await admin.unsafe(`create database "${dbName}"`);
  await admin.end({ timeout: 5 });

  migrator = postgres(dbUrl.toString(), opts);
  await migrator`create table kraken_migrations (name text primary key, checksum text not null)`;
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files.filter((f) => f < TARGET)) {
    await migrator.unsafe(await readFile(path.join(dir, file), "utf8"));
  }
  held = postgres(dbUrl.toString(), opts);
});

afterAll(async () => {
  await held?.end({ timeout: 5 });
  await migrator?.end({ timeout: 5 });
  const admin = postgres(adminUrl.toString(), opts);
  await admin.unsafe(
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${dbName}'`,
  );
  await admin.unsafe(`drop database if exists "${dbName}"`);
  await admin.end({ timeout: 5 });
});

describe(`migration ${TARGET}`, () => {
  it("leaves a connection that wrote work items before it able to write after it", async () => {
    const [client] = await held<{ id: string }[]>`insert into clients (name) values ('C') returning id`;
    if (!client) throw new Error("client insert returned no row");
    const [project] = await held<{ id: string }[]>`
      insert into projects (client_id, name, slug, billing_model, currency, hourly_rate, portal_password_hash)
      values (${client.id}, 'P', 'p', 'hourly', 'USD', 100, 'x')
      returning id
    `;
    if (!project) throw new Error("project insert returned no row");
    const [item] = await held<{ id: string }[]>`
      insert into work_items (project_id, type, status, title, source)
      values (${project.id}, 'feature', 'ready_for_review', 'Review me', 'agent')
      returning id
    `;
    if (!item) throw new Error("item insert returned no row");
    // Warm the trigger's plan on the held session, as a live instance would.
    await held`update work_items set title = 'Warm' where id = ${item.id}`;

    await migrator.unsafe(await readFile(path.join(dir, TARGET), "utf8"));

    await held`update work_items set status = 'done' where id = ${item.id}`;
    await held`insert into work_items (project_id, type, title) values (${project.id}, 'bug', 'After')`;
    const rows = await held<{ title: string; status: string; completed: boolean }[]>`
      select title, status::text, completed_at is not null as completed
      from work_items order by title
    `;
    expect(rows).toEqual([
      { title: "After", status: "backlog", completed: false },
      { title: "Warm", status: "done", completed: true },
    ]);
  });
});
