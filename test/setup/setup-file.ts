import { inject } from "vitest";

declare module "vitest" {
  interface ProvidedContext {
    KRAKEN_TEST_DATABASE_URL: string;
  }
}

/**
 * Runs inside each worker before any test file is imported, so `@/lib/db/client`
 * sees a DATABASE_URL the moment it is first required.
 */
process.env.DATABASE_URL = inject("KRAKEN_TEST_DATABASE_URL");
process.env.KRAKEN_SESSION_SECRET =
  "test-secret-that-is-definitely-at-least-32-characters-long";
process.env.KRAKEN_AUTH_MODE = "local";
process.env.KRAKEN_STORAGE_MODE = "local";
process.env.KRAKEN_LOCAL_STORAGE_DIR = ".storage-test";
process.env.KRAKEN_APP_URL = "http://localhost:3100";
// One connection for the whole run. The test database is shared mutable state
// and `resetDatabase` truncates it between tests; a pool lets one test's
// queries interleave with the next test's TRUNCATE, which shows up as rare,
// unreproducible failures in whichever file happens to run alongside.
process.env.DATABASE_POOL_MAX = "1";

import { afterAll } from "vitest";

/**
 * `@/lib/db/client` exports a module-level pool that every test file shares.
 * Closing it in a file's own `afterAll` therefore tears it down for whichever
 * files run after it, which shows up as a handful of unrelated failures that
 * pass when the file is run alone. It is closed once, here, instead.
 */
afterAll(async () => {
  const { sql } = await import("@/lib/db/client");
  await sql.end({ timeout: 5 });
});
