/**
 * Gives the test run its own Postgres database on the local development cluster
 * and applies the real migrations to it. Tests therefore exercise the actual
 * schema, including every guard trigger -- an adversarial test that tries to
 * edit a finalized invoice is hitting the same constraint production has.
 *
 * Prerequisite: `npm run db:start`.
 */
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { applyPending } from "../../scripts/migrate";

const ADMIN_URL =
  process.env.TEST_ADMIN_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres@127.0.0.1:54329/postgres";

export default async function setup(project: {
  provide: (key: "KRAKEN_TEST_DATABASE_URL", value: string) => void;
}) {
  const dbName = `kraken_test_${randomBytes(6).toString("hex")}`;
  const admin = postgres(ADMIN_URL, { prepare: false, max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`create database "${dbName}"`);
  } catch (error) {
    await admin.end({ timeout: 5 });
    throw new Error(
      `Could not create the test database. Is the local cluster running? ` +
        `Run \`npm run db:start\`.\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
  await admin.end({ timeout: 5 });

  const url = new URL(ADMIN_URL);
  url.pathname = `/${dbName}`;
  const testUrl = url.toString();

  const sql = postgres(testUrl, { prepare: false, max: 1, onnotice: () => {} });
  await applyPending(sql, () => {});
  await sql.end({ timeout: 5 });

  project.provide("KRAKEN_TEST_DATABASE_URL", testUrl);

  return async () => {
    const cleanup = postgres(ADMIN_URL, { prepare: false, max: 1, onnotice: () => {} });
    await cleanup.unsafe(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${dbName}'`,
    );
    await cleanup.unsafe(`drop database if exists "${dbName}"`);
    await cleanup.end({ timeout: 5 });
  };
}
