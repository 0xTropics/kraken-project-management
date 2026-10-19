import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

/**
 * The supabase branch is the one production runs and the e2e suite never
 * reaches, so its allow-list rule is pinned here with Supabase Auth stubbed.
 */
let user: { id: string } | null = null;
type SetAll = (cookies: { name: string; value: string; options: object }[]) => void;
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: SetAll } }) => ({
    auth: {
      // Like the real client, getUser() rotates the session and hands the
      // refreshed cookie to setAll; the proxy must pass it on to the browser.
      getUser: async () => {
        options.cookies.setAll([{ name: "sb-test-auth-token", value: "refreshed", options: {} }]);
        return { data: { user } };
      },
    },
  }),
}));

const OPERATOR = "6f1c3c1e-0000-4000-8000-000000000001";
const request = () => new NextRequest("http://localhost:3100/app/clients");
const signInRedirect = (response: Response) =>
  response.status === 307 && new URL(response.headers.get("location") ?? "").pathname === "/login";

describe("proxy in supabase mode", () => {
  beforeEach(() => {
    process.env.KRAKEN_AUTH_MODE = "supabase";
    process.env.KRAKEN_INTERNAL_USER_IDS = OPERATOR;
  });
  afterEach(() => {
    process.env.KRAKEN_AUTH_MODE = "local";
    delete process.env.KRAKEN_INTERNAL_USER_IDS;
    user = null;
  });

  it("lets an allow-listed user through, carrying the refreshed session cookie", async () => {
    user = { id: OPERATOR };
    const response = await proxy(request());
    expect(signInRedirect(response)).toBe(false);
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
  });

  it("reads the allow-list the way env.ts parses it: trimmed, comma-separated", async () => {
    process.env.KRAKEN_INTERNAL_USER_IDS = ` other , ${OPERATOR} `;
    user = { id: OPERATOR };
    expect(signInRedirect(await proxy(request()))).toBe(false);
  });

  it("sends a signed-in user who is not on the allow-list to sign in", async () => {
    user = { id: "6f1c3c1e-0000-4000-8000-000000000002" };
    expect(signInRedirect(await proxy(request()))).toBe(true);
  });

  it("sends everyone to sign in when the allow-list is empty", async () => {
    process.env.KRAKEN_INTERNAL_USER_IDS = "";
    user = { id: OPERATOR };
    expect(signInRedirect(await proxy(request()))).toBe(true);
  });

  it("sends a visitor with no Supabase session to sign in", async () => {
    expect(signInRedirect(await proxy(request()))).toBe(true);
  });
});

describe("proxy in local mode", () => {
  it("does not accept a cookie that merely exists", async () => {
    const forged = request();
    forged.cookies.set("kraken_session", "not-a-real-token");
    expect(signInRedirect(await proxy(forged))).toBe(true);
  });
});
