import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/db/client";
import { POST as loginRoute } from "@/app/api/portal/[slug]/login/route";
import { POST as logoutRoute } from "@/app/api/portal/logout/route";
import { portalScopeFromToken } from "@/lib/data/portal";
import { hashPassword } from "@/lib/auth/password";
import { createProject, resetDatabase } from "../setup/factories";

/**
 * The portal's front door, driven through the real route handlers.
 */

const PASSWORD = "correct-horse-battery";

beforeEach(resetDatabase);

async function login(slug: string, password: string, ip = "203.0.113.9") {
  const request = new Request(`http://localhost:3100/api/portal/${slug}/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "user-agent": "vitest",
    },
    body: JSON.stringify({ password }),
  });
  const response = await loginRoute(request, { params: Promise.resolve({ slug }) });
  return {
    status: response.status,
    cookie: response.cookies.get("kraken_portal")?.value ?? null,
    body: await response.json().catch(() => null),
  };
}

describe("portal login", () => {
  it("issues a working session for the right password", async () => {
    const project = await createProject({ slug: "acme", portalPassword: PASSWORD });
    const result = await login("acme", PASSWORD);

    expect(result.status).toBe(200);
    expect(result.cookie).toBeTruthy();

    const scope = await portalScopeFromToken(result.cookie!);
    expect(scope?.projectId).toBe(project.id);
  });

  it("refuses the wrong password and issues no cookie", async () => {
    await createProject({ slug: "acme", portalPassword: PASSWORD });
    const result = await login("acme", "not-the-password");
    expect(result.status).toBe(401);
    expect(result.cookie).toBeFalsy();
  });

  it("refuses an unknown slug without revealing that it is unknown", async () => {
    await createProject({ slug: "acme", portalPassword: PASSWORD });
    const unknown = await login("does-not-exist", PASSWORD);
    const wrong = await login("acme", "wrong");
    expect(unknown.status).toBe(401);
    // Byte-identical to a wrong password, so the response cannot enumerate slugs.
    expect(unknown.body).toEqual(wrong.body);
  });

  it("records every attempt, successful or not", async () => {
    const project = await createProject({ slug: "acme", portalPassword: PASSWORD });
    await login("acme", "wrong-one");
    await login("acme", PASSWORD);

    const attempts = await sql<{ success: boolean; ip: string; project_id: string }[]>`
      select success, host(ip) as ip, project_id
      from portal_login_attempts
      order by created_at
    `;
    expect(attempts).toHaveLength(2);
    expect(attempts.map((a) => a.success)).toEqual([false, true]);
    expect(attempts.every((a) => a.ip === "203.0.113.9")).toBe(true);
    expect(attempts.every((a) => a.project_id === project.id)).toBe(true);
  });

  it("records an attempt against an unknown slug too, with no project", async () => {
    await login("ghost-project", "anything");
    const [attempt] = await sql<{ slug: string; project_id: string | null; success: boolean }[]>`
      select slug, project_id, success from portal_login_attempts
    `;
    expect(attempt.slug).toBe("ghost-project");
    expect(attempt.project_id).toBeNull();
    expect(attempt.success).toBe(false);
  });

  it("writes an audit row for a successful login and none for a failure", async () => {
    await createProject({ slug: "acme", portalPassword: PASSWORD });
    await login("acme", "wrong");
    expect(await sql`select 1 from audit_log`).toHaveLength(0);

    await login("acme", PASSWORD);
    const rows = await sql<{ action: string; actor_type: string }[]>`
      select action, actor_type from audit_log
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("portal.login");
    expect(rows[0].actor_type).toBe("portal");
  });

  it("never writes the password into the audit log", async () => {
    await createProject({ slug: "acme", portalPassword: PASSWORD });
    await login("acme", PASSWORD);
    const [row] = await sql<{ payload: unknown }[]>`select payload from audit_log`;
    expect(JSON.stringify(row.payload)).not.toContain(PASSWORD);
  });

  it("invalidates a live session when the password is rotated", async () => {
    const project = await createProject({ slug: "acme", portalPassword: PASSWORD });
    const { cookie } = await login("acme", PASSWORD);
    expect(await portalScopeFromToken(cookie!)).not.toBeNull();

    await sql`
      update projects
      set portal_password_hash = ${await hashPassword("a-totally-new-password")},
          portal_password_version = portal_password_version + 1
      where id = ${project.id}
    `;

    expect(await portalScopeFromToken(cookie!)).toBeNull();

    // The old password no longer works, the new one does.
    expect((await login("acme", PASSWORD)).status).toBe(401);
    expect((await login("acme", "a-totally-new-password")).status).toBe(200);
  });

  it("does not let one project's password open another project", async () => {
    await createProject({ slug: "alpha", portalPassword: "alpha-password-here" });
    await createProject({ slug: "beta", portalPassword: "beta-password-here" });
    expect((await login("beta", "alpha-password-here")).status).toBe(401);
  });

  it("clears the cookie and redirects back to the project's login on logout", async () => {
    const project = await createProject({ slug: "acme", portalPassword: PASSWORD });
    const { cookie } = await login("acme", PASSWORD);

    const response = await logoutRoute(
      new Request("http://localhost:3100/api/portal/logout", {
        method: "POST",
        headers: { cookie: `kraken_portal=${cookie}` },
      }),
      undefined,
    );

    // 303 so the browser follows with GET; a JSON body would leave the client
    // staring at `{"ok":true}` with no way back.
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(`/portal/${project.slug}`);

    // Read the real header rather than the NextResponse cookie helper, which
    // does not surface cookies set on a redirect response.
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/kraken_portal=;/);
    expect(setCookie).toMatch(/Max-Age=0/);
  });

  it("logs out to a generic page when there is no session to resolve a slug from", async () => {
    const response = await logoutRoute(
      new Request("http://localhost:3100/api/portal/logout", { method: "POST" }),
      undefined,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie") ?? "").toMatch(/kraken_portal=;/);
  });

  /**
   * The portal session is a stateless signed cookie, so signing out
   * removes the browser's copy but cannot revoke a copy someone else already
   * has. Rotating the password is what invalidates outstanding cookies. This
   * asserts the actual guarantee rather than implying a stronger one.
   */
  it("logout does not revoke a cookie someone else already holds; rotation does", async () => {
    const project = await createProject({ slug: "acme", portalPassword: PASSWORD });
    const { cookie } = await login("acme", PASSWORD);

    await logoutRoute(
      new Request("http://localhost:3100/api/portal/logout", {
        method: "POST",
        headers: { cookie: `kraken_portal=${cookie}` },
      }),
      undefined,
    );
    expect(await portalScopeFromToken(cookie!)).not.toBeNull();

    await sql`
      update projects
      set portal_password_hash = ${await hashPassword("rotated-after-logout")},
          portal_password_version = portal_password_version + 1
      where id = ${project.id}
    `;
    expect(await portalScopeFromToken(cookie!)).toBeNull();
  });
});
