import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as logoutRoute } from "@/app/api/portal/logout/route";
import { signPortalSession, PORTAL_COOKIE } from "@/lib/auth/portal-session";
import { createProject, resetDatabase } from "../setup/factories";

/**
 * Signing out of the portal.
 *
 * The redirect is built from the request rather than from KRAKEN_APP_URL. That
 * variable can be schemeless, in which case `new URL` throws and the route
 * would return a 500 *before* reaching the line that clears the cookie -- so
 * the client could not sign out and was signed back in on their next visit.
 * The request already carries the right origin, and it is correct on preview
 * deployments and custom domains where a single env var cannot be.
 */

const ORIGINAL = process.env.KRAKEN_APP_URL;

beforeEach(resetDatabase);
afterEach(() => {
  process.env.KRAKEN_APP_URL = ORIGINAL;
});

async function logout(origin: string, cookie: string | null) {
  const request = new Request(`${origin}/api/portal/logout`, {
    method: "POST",
    headers: cookie ? { cookie: `${PORTAL_COOKIE}=${cookie}` } : {},
  });
  const response = await logoutRoute(request, undefined);
  return {
    status: response.status,
    location: response.headers.get("location"),
    cleared: response.cookies.get(PORTAL_COOKIE)?.value === "",
  };
}

describe("portal logout", () => {
  it("redirects to the project's own login and clears the cookie", async () => {
    const project = await createProject({ slug: "acme", portalPassword: "correct-horse" });
    const cookie = await signPortalSession(project.id, project.portal_password_version);

    const result = await logout("https://kraken.example.app", cookie);

    expect(result.status).toBe(303);
    expect(result.location).toBe("https://kraken.example.app/portal/acme?signed-out=1");
    expect(result.cleared).toBe(true);
  });

  it("uses the origin the request arrived on, not a configured one", async () => {
    process.env.KRAKEN_APP_URL = "https://production.example.app";
    const project = await createProject({ slug: "acme", portalPassword: "correct-horse" });
    const cookie = await signPortalSession(project.id, project.portal_password_version);

    // A preview deployment or custom domain: one env var cannot be right for
    // every origin the app is reachable on.
    const result = await logout("https://preview-abc123.vercel.app", cookie);

    expect(result.location).toBe("https://preview-abc123.vercel.app/portal/acme?signed-out=1");
  });

  it("still signs out when KRAKEN_APP_URL is malformed", async () => {
    process.env.KRAKEN_APP_URL = "kraken.example.com";
    const project = await createProject({ slug: "acme", portalPassword: "correct-horse" });
    const cookie = await signPortalSession(project.id, project.portal_password_version);

    const result = await logout("https://kraken.example.com", cookie);

    expect(result.status).toBe(303);
    expect(result.cleared).toBe(true);
  });

  it("clears the cookie even when there is no valid session to resolve", async () => {
    const result = await logout("https://kraken.example.app", "not-a-real-token");

    expect(result.status).toBe(303);
    expect(result.location).toBe("https://kraken.example.app/");
    expect(result.cleared).toBe(true);
  });
});
