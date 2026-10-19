import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { POST as loginRoute } from "@/app/api/portal/[slug]/login/route";
import { createProject, resetDatabase } from "../setup/factories";

/**
 * A portal password must not be guessable forever: 10 failures from one IP for
 * one slug inside 15 minutes lock that pair out, even for the right password.
 * The key is (slug, ip) rather than project, so an unknown slug locks exactly
 * like a real one and the lockout cannot be used to enumerate portals.
 */

const PASSWORD = "correct-horse-battery";
const LOCKED = "Too many attempts. Try again in a few minutes.";
const IP = "203.0.113.9";

beforeEach(async () => {
  await resetDatabase();
  await createProject({ slug: "acme", portalPassword: PASSWORD });
});

async function login(slug: string, password: string, ip: string | null = IP) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "vitest",
  };
  if (ip !== null) {
    headers["x-forwarded-for"] = ip;
    headers["x-real-ip"] = ip;
  }
  const request = new Request(`http://localhost:3100/api/portal/${slug}/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ password }),
  });
  const response = await loginRoute(request, { params: Promise.resolve({ slug }) });
  return {
    status: response.status,
    cookie: response.cookies.get("kraken_portal")?.value ?? null,
    body: await response.json().catch(() => null),
  };
}

async function fail(slug: string, times: number, ip: string | null = IP) {
  for (let i = 0; i < times; i++) {
    expect((await login(slug, "wrong", ip)).status).toBe(401);
  }
}

describe("portal login lockout", () => {
  it("refuses even the right password after 10 failures from one IP", async () => {
    await fail("acme", 10);
    const result = await login("acme", PASSWORD);
    expect(result.status).toBe(429);
    expect(result.body.error).toBe(LOCKED);
    expect(result.cookie).toBeNull();
  });

  it("does not lock at 9 failures", async () => {
    await fail("acme", 9);
    expect((await login("acme", PASSWORD)).status).toBe(200);
  });

  it("does not lock out a different IP", async () => {
    await fail("acme", 10);
    expect((await login("acme", PASSWORD, "203.0.113.10")).status).toBe(200);
  });

  it("locks out an unknown slug identically", async () => {
    await fail("ghost", 10);
    const ghost = await login("ghost", PASSWORD);
    await fail("acme", 10, "203.0.113.11");
    const acme = await login("acme", PASSWORD, "203.0.113.11");

    expect(ghost.status).toBe(429);
    expect(ghost.body).toEqual(acme.body);
  });

  it("lifts the lockout once the window passes", async () => {
    await fail("acme", 10);
    await sql`update portal_login_attempts set created_at = now() - interval '16 minutes'`;
    expect((await login("acme", PASSWORD)).status).toBe(200);
  });

  it("records refused attempts as failures", async () => {
    await fail("acme", 10);
    await login("acme", PASSWORD);
    const rows = await sql<{ success: boolean }[]>`
      select success from portal_login_attempts order by created_at, id
    `;
    expect(rows).toHaveLength(11);
    expect(rows.at(-1)?.success).toBe(false);
  });

  it("counts by slug alone when the request carries no IP", async () => {
    await fail("acme", 10, null);
    expect((await login("acme", PASSWORD, null)).status).toBe(429);
  });
});
