import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Next.js compiles `@/lib/db/client` once per bundle layer -- the route
 * handlers get one copy, the server components another -- so a single
 * production process evaluates this module more than once. Re-evaluating it
 * here with `vi.resetModules()` models exactly that. Each evaluation that
 * creates its own pool multiplies the connections a Vercel instance can hold
 * against the session-mode pooler's hard cap (`EMAXCONNSESSION`).
 */
describe("db client pool", () => {
  const originalPool = globalThis.__krakenSql;
  const created: { end: (opts?: { timeout?: number }) => Promise<void> }[] = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    globalThis.__krakenSql = originalPool;
    vi.resetModules();
    // Pools connect lazily, so none of these ever opened a socket; ending them
    // just clears their timers.
    await Promise.all(created.map((pool) => pool.end({ timeout: 1 })));
    created.length = 0;
  });

  it("is one pool per process in production, not one per module evaluation", async () => {
    vi.stubEnv("NODE_ENV", "production");
    globalThis.__krakenSql = undefined;

    vi.resetModules();
    const first = await import("@/lib/db/client");
    created.push(first.sql);
    vi.resetModules();
    const second = await import("@/lib/db/client");
    created.push(second.sql);

    expect(second.sql).toBe(first.sql);
  });
});
