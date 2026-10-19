import { beforeEach, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { sql } from "@/lib/db/client";
import { signPortalSession } from "@/lib/auth/portal-session";
import { portalScopeFromToken } from "@/lib/data/portal";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createProject, resetDatabase } from "../setup/factories";

const SECRET = new TextEncoder().encode(
  "test-secret-that-is-definitely-at-least-32-characters-long",
);

beforeEach(resetDatabase);

describe("the two auth contexts never substitute for one another", () => {
  it("an internal session token is not a portal token", async () => {
    const project = await createProject();
    // Same secret, same algorithm -- only the audience differs. If the portal
    // accepted this, any signed-in operator's cookie would open every portal.
    const internalish = await new SignJWT({ pv: project.portal_password_version })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(project.id)
      .setIssuedAt()
      .setIssuer("kraken")
      .setAudience("kraken-internal")
      .setExpirationTime("1h")
      .sign(SECRET);

    expect(await portalScopeFromToken(internalish)).toBeNull();
  });

  it("a portal token is not accepted for another project", async () => {
    const a = await createProject();
    const b = await createProject();
    const token = await signPortalSession(a.id, a.portal_password_version);
    const scope = await portalScopeFromToken(token);
    expect(scope?.projectId).toBe(a.id);
    expect(scope?.projectId).not.toBe(b.id);
  });

  it("a portal token signed with a different secret is rejected", async () => {
    const project = await createProject();
    const forged = await new SignJWT({ pv: project.portal_password_version })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(project.id)
      .setIssuedAt()
      .setIssuer("kraken")
      .setAudience("kraken-portal")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-completely-different-secret-32-chars!!"));

    expect(await portalScopeFromToken(forged)).toBeNull();
  });

  it("an expired portal token is rejected", async () => {
    const project = await createProject();
    const expired = await new SignJWT({ pv: project.portal_password_version })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(project.id)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setIssuer("kraken")
      .setAudience("kraken-portal")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(SECRET);

    expect(await portalScopeFromToken(expired)).toBeNull();
  });

  it("rotating the portal password invalidates tokens already issued", async () => {
    const project = await createProject();
    const token = await signPortalSession(project.id, project.portal_password_version);
    expect(await portalScopeFromToken(token)).not.toBeNull();

    await sql`
      update projects
      set portal_password_hash = ${await hashPassword("a-brand-new-password")},
          portal_password_version = portal_password_version + 1
      where id = ${project.id}
    `;

    expect(await portalScopeFromToken(token)).toBeNull();
  });

  it("a portal token for an archived project is rejected", async () => {
    const project = await createProject();
    const token = await signPortalSession(project.id, project.portal_password_version);
    await sql`update projects set archived_at = now() where id = ${project.id}`;
    expect(await portalScopeFromToken(token)).toBeNull();
  });

  it("garbage is rejected rather than throwing", async () => {
    for (const value of ["", "not-a-jwt", "a.b.c", "Bearer x"]) {
      expect(await portalScopeFromToken(value)).toBeNull();
    }
  });
});

describe("password hashing", () => {
  it("produces an argon2id hash that verifies and does not contain the password", async () => {
    const digest = await hashPassword("correct-horse-battery-staple");
    expect(digest.startsWith("$argon2id$")).toBe(true);
    expect(digest).not.toContain("correct-horse");
    expect(await verifyPassword(digest, "correct-horse-battery-staple")).toBe(true);
    expect(await verifyPassword(digest, "Correct-horse-battery-staple")).toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const a = await hashPassword("same-password-here");
    const b = await hashPassword("same-password-here");
    expect(a).not.toBe(b);
  });

  it("treats a corrupt digest as a failed login rather than an error", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
    expect(await verifyPassword("", "anything")).toBe(false);
  });
});
