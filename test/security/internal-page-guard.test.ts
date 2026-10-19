import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireInternalPage, signLocalSession } from "@/lib/auth/internal";
import type { InternalUser } from "@/lib/db/types";
import { createInternalUser, resetDatabase } from "../setup/factories";

/**
 * The pages' own check, proven without the proxy: `requireInternalPage()` is
 * what every page, layout, and generateMetadata under /app opens with.
 */
let token: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kraken_session" && token ? { value: token } : undefined),
  }),
}));

/** The URL a Next redirect() error points at, or null if nothing was thrown. */
async function redirectTarget(pending: Promise<unknown>): Promise<string | null> {
  try {
    await pending;
    return null;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT;")) throw error;
    return digest.split(";")[2] ?? null;
  }
}

beforeEach(async () => {
  await resetDatabase();
  token = undefined;
});

describe("requireInternalPage", () => {
  it("redirects to sign-in, carrying next, when there is no session", async () => {
    expect(await redirectTarget(requireInternalPage("/app/clients"))).toBe(
      "/login?next=%2Fapp%2Fclients",
    );
  });

  it("redirects to plain /login when no next is given", async () => {
    expect(await redirectTarget(requireInternalPage())).toBe("/login");
  });

  it("does not accept a cookie that merely exists", async () => {
    token = "not-a-real-token";
    expect(await redirectTarget(requireInternalPage("/app"))).toBe("/login?next=%2Fapp");
  });

  it("returns the session for a signed cookie whose operator still exists", async () => {
    const user = await createInternalUser();
    token = await signLocalSession({ ...user, name: "Morgan Hale" } as InternalUser);
    const session = await requireInternalPage("/app");
    expect(session.userId).toBe(user.id);
  });
});
