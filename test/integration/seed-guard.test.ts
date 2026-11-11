import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { createClient, resetDatabase } from "../setup/factories";
import { SEED_CLIENT_NAMES, assertSeedable } from "../../scripts/seed-guard";

/**
 * `db:seed` truncates every table, so it must refuse to run against a
 * database holding a client the demo seed did not create.
 */

beforeEach(resetDatabase);

describe("assertSeedable", () => {
  it("allows an empty database", async () => {
    await expect(assertSeedable(sql)).resolves.toBeUndefined();
  });

  it("allows a database holding only the seed's clients", async () => {
    for (const name of SEED_CLIENT_NAMES) await createClient({ name });
    await expect(assertSeedable(sql)).resolves.toBeUndefined();
  });

  it("refuses when a client the seed did not create exists", async () => {
    await createClient({ name: "Tidewater Supply" });
    await expect(assertSeedable(sql)).rejects.toThrow(/Refusing to seed/);
  });

  it("does not print the client's name", async () => {
    await createClient({ name: "Tidewater Supply" });
    await expect(assertSeedable(sql)).rejects.not.toThrow(/Tidewater/);
  });

  it("db:seed exits non-zero and leaves the data alone", async () => {
    await createClient({ name: "Tidewater Supply" });
    const run = spawnSync("npx", ["tsx", "scripts/seed.ts"], {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      encoding: "utf8",
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr + run.stdout).toMatch(/Refusing to seed/);
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from clients`;
    if (!row) throw new Error("count returned no row");
    expect(row.n).toBe(1);
  });
});
