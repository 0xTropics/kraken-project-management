import { beforeEach, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { sql } from "@/lib/db/client";
import {
  findProjectForLogin,
  getPortalWorkItems,
  getPortalHours,
  getPortalInvoices,
  getPortalInvoiceDownloadUrl,
  getPortalProject,
  getPortalUpdates,
  portalScopeFromToken,
  type PortalScope,
} from "@/lib/data/portal";
import { signPortalSession } from "@/lib/auth/portal-session";
import { hashPassword } from "@/lib/auth/password";
import { finalizeInvoice, setInvoicePublished, voidInvoice, createDraftInvoice } from "@/lib/invoices/engine";
import {
  createInternalUser,
  createMilestone,
  createProgressNote,
  createProject,
  createTimeEntry,
  createWorkItem,
  resetDatabase,
} from "../setup/factories";

/**
 * The single most important test file in the product.
 *
 * RLS cannot isolate the portal — there is no per-user identity to write
 * a policy against — so isolation lives entirely in `src/lib/data/portal.ts`.
 * Every case below builds two fully-populated projects and asserts that a scope
 * for one can never see anything belonging to the other, and that everything
 * marked internal stays internal.
 */

const SECRET = new TextEncoder().encode(
  "test-secret-that-is-definitely-at-least-32-characters-long",
);

beforeEach(resetDatabase);

async function scopeFor(projectId: string, version = 1): Promise<PortalScope> {
  const scope = await portalScopeFromToken(await signPortalSession(projectId, version));
  if (!scope) throw new Error("expected a valid scope for the test fixture");
  return scope;
}

/** Two projects, each with the full range of visible and hidden content. */
async function twoProjects() {
  const a = await createProject({ slug: "alpha", name: "Alpha", billing_model: "hourly", hourly_rate: 150 });
  const b = await createProject({ slug: "beta", name: "Beta", billing_model: "hourly", hourly_rate: 200 });

  for (const [project, tag] of [
    [a, "ALPHA"],
    [b, "BETA"],
  ] as const) {
    const milestone = await createMilestone(project.id, { name: `${tag}-MILESTONE` });
    await createWorkItem(project.id, {
      title: `${tag}-VISIBLE-FEATURE`,
      type: "feature",
      status: "in_progress",
      client_visible: true,
      milestone_id: milestone.id,
    });
    await createWorkItem(project.id, {
      title: `${tag}-VISIBLE-BUG`,
      type: "bug",
      status: "planned",
      client_visible: true,
    });
    await createProgressNote(project.id, {
      body: `${tag}-APPROVED-NOTE`,
      approved_at: new Date().toISOString() as unknown as string,
    });
    await createTimeEntry(project.id, { hours_worked: 5, hours_billed: 5 });
  }
  return { a, b };
}

describe("a scope never reaches another project's data", () => {
  it("returns only its own project", async () => {
    const { a, b } = await twoProjects();
    const scope = await scopeFor(a.id);
    const project = await getPortalProject(scope);
    expect(project?.id).toBe(a.id);
    expect(project?.name).toBe("Alpha");
    expect(project?.id).not.toBe(b.id);
  });

  it("returns only its own updates, work items, hours, and invoices", async () => {
    const { a } = await twoProjects();
    const scope = await scopeFor(a.id);

    const payload = JSON.stringify({
      updates: await getPortalUpdates(scope),
      workItems: await getPortalWorkItems(scope),
      hours: await getPortalHours(scope),
      invoices: await getPortalInvoices(scope),
    });

    expect(payload).toContain("ALPHA-");
    expect(payload).not.toContain("BETA-");
  });

  it("does not leak another project's milestone names", async () => {
    const { a } = await twoProjects();
    const items = await getPortalWorkItems(await scopeFor(a.id));
    expect(items.every((f) => (f.milestone_name ?? "").startsWith("ALPHA") || f.milestone_name === null)).toBe(true);
  });
});

describe("nothing internal reaches the portal", () => {
  it("hides unapproved progress notes", async () => {
    const project = await createProject();
    await createProgressNote(project.id, { body: "APPROVED", approved_at: new Date().toISOString() as unknown as string });
    await createProgressNote(project.id, { body: "UNAPPROVED", approved_at: null });

    const bodies = (await getPortalUpdates(await scopeFor(project.id))).map((u) => u.body);
    expect(bodies).toContain("APPROVED");
    expect(bodies).not.toContain("UNAPPROVED");
  });

  /**
   * `client_visible` is the whole rule, and type is not a second gate.
   *
   * Until 2026-09-05 a chore was hidden even with the flag on, which made the
   * toggle a lie for a third of the type enum: the operator ticked "show this
   * to the client" and nothing happened, with no way to tell from the board.
   * The flag defaults to false (`work_items.client_visible`, core.sql), so
   * nothing reaches a client that was not deliberately published.
   */
  it("shows any client_visible item whatever its type, and hides the rest", async () => {
    const project = await createProject();
    for (const type of ["feature", "bug", "chore"] as const) {
      await createWorkItem(project.id, {
        title: `SHOWN-${type.toUpperCase()}`,
        type,
        status: "planned",
        client_visible: true,
      });
      await createWorkItem(project.id, {
        title: `HIDDEN-${type.toUpperCase()}`,
        type,
        status: "planned",
        client_visible: false,
      });
    }

    const titles = (await getPortalWorkItems(await scopeFor(project.id))).map((i) => i.title);

    expect(titles).toContain("SHOWN-FEATURE");
    expect(titles).toContain("SHOWN-BUG");
    expect(titles).toContain("SHOWN-CHORE");
    expect(titles).not.toContain("HIDDEN-FEATURE");
    expect(titles).not.toContain("HIDDEN-BUG");
    expect(titles).not.toContain("HIDDEN-CHORE");
  });

  it("never shows backlog or wont_do — so parked work cannot read as finished", async () => {
    const project = await createProject();
    for (const status of ["backlog", "wont_do"] as const) {
      await createWorkItem(project.id, {
        title: `HIDDEN-${status.toUpperCase()}`,
        type: "feature",
        status,
        client_visible: true,
      });
    }
    for (const status of ["planned", "in_progress", "done"] as const) {
      await createWorkItem(project.id, {
        title: `SHOWN-${status.toUpperCase()}`,
        type: "feature",
        status,
        client_visible: true,
      });
    }

    const titles = (await getPortalWorkItems(await scopeFor(project.id))).map((i) => i.title).sort();
    expect(titles).toEqual(["SHOWN-DONE", "SHOWN-IN_PROGRESS", "SHOWN-PLANNED"]);
  });

  it("hides a milestone that is not client_visible while still showing its items", async () => {
    const project = await createProject();
    const secret = await createMilestone(project.id, { name: "INTERNAL-MILESTONE", client_visible: false });
    await createWorkItem(project.id, {
      title: "Shown item",
      type: "feature",
      status: "planned",
      client_visible: true,
      milestone_id: secret.id,
    });
    const features = await getPortalWorkItems(await scopeFor(project.id));
    expect(features).toHaveLength(1);
    expect(features[0].milestone_name).toBeNull();
  });

  it("returns no money and no secrets on the project record", async () => {
    const project = await createProject({ billing_model: "hourly", hourly_rate: 165 });
    const result = await getPortalProject(await scopeFor(project.id));
    const keys = Object.keys(result ?? {});
    for (const forbidden of [
      "portal_password_hash",
      "hourly_rate",
      "retainer_amount",
      "tax_rate",
      "payment_instructions",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
    expect(JSON.stringify(result)).not.toContain("165");
  });
});

describe("hours", () => {
  it("is null for a retainer project", async () => {
    const project = await createProject({ billing_model: "retainer", retainer_amount: 4000 });
    await createTimeEntry(project.id, { hours_worked: 9, hours_billed: 9 });
    expect(await getPortalHours(await scopeFor(project.id))).toBeNull();
  });

  it("reports billed hours and never the worked total or the goodwill gap", async () => {
    const project = await createProject({ billing_model: "hourly", hourly_rate: 150 });
    await createTimeEntry(project.id, { hours_worked: 8, hours_billed: 5, discount_reason: "goodwill" });

    const hours = await getPortalHours(await scopeFor(project.id));
    expect(hours?.current_period_hours).toBe(5);
    const payload = JSON.stringify(hours);
    expect(payload).not.toContain("hours_worked");
    expect(payload).not.toContain("goodwill");
    expect(payload).not.toContain("8");
  });
});

describe("invoices", () => {
  async function invoiceFixture() {
    const user = await createInternalUser();
    const project = await createProject({ billing_model: "hourly", hourly_rate: 100 });
    await createTimeEntry(project.id, { date: "2026-03-10", hours_worked: 4, hours_billed: 4 });
    return { user, project };
  }

  it("shows only published, finalized invoices", async () => {
    const { user, project } = await invoiceFixture();

    // A draft: never visible.
    await createDraftInvoice({
      projectId: project.id,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      actorId: user.id,
    });

    // Finalized but not published: still not visible.
    await createTimeEntry(project.id, { date: "2026-04-10", hours_worked: 3, hours_billed: 3 });
    const unpublished = await createDraftInvoice({
      projectId: project.id,
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      actorId: user.id,
    });
    await finalizeInvoice(unpublished.id, user.id);

    // Finalized and published: visible.
    await createTimeEntry(project.id, { date: "2026-05-10", hours_worked: 6, hours_billed: 6 });
    const published = await createDraftInvoice({
      projectId: project.id,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      actorId: user.id,
    });
    await finalizeInvoice(published.id, user.id);
    await setInvoicePublished(published.id, true, user.id);

    const invoices = await getPortalInvoices(await scopeFor(project.id));
    expect(invoices).toHaveLength(1);
    expect(invoices[0].id).toBe(published.id);
  });

  it("drops an invoice from the portal the moment it is voided", async () => {
    const { user, project } = await invoiceFixture();
    const invoice = await createDraftInvoice({
      projectId: project.id,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      actorId: user.id,
    });
    await finalizeInvoice(invoice.id, user.id);
    await setInvoicePublished(invoice.id, true, user.id);

    const scope = await scopeFor(project.id);
    expect(await getPortalInvoices(scope)).toHaveLength(1);

    await voidInvoice(invoice.id, user.id);
    expect(await getPortalInvoices(scope)).toHaveLength(0);
  });

  it("refuses a download for another project's invoice and for an unpublished one", async () => {
    const user = await createInternalUser();
    const a = await createProject({ slug: "dl-a", billing_model: "hourly", hourly_rate: 100 });
    const b = await createProject({ slug: "dl-b", billing_model: "hourly", hourly_rate: 100 });

    await createTimeEntry(a.id, { date: "2026-03-10", hours_worked: 4, hours_billed: 4 });
    const aInvoice = await createDraftInvoice({
      projectId: a.id,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      actorId: user.id,
    });
    await finalizeInvoice(aInvoice.id, user.id);
    await setInvoicePublished(aInvoice.id, true, user.id);

    // B's scope must not be able to fetch A's published invoice.
    expect(await getPortalInvoiceDownloadUrl(await scopeFor(b.id), aInvoice.id)).toBeNull();

    // Unpublishing hides it from its own project too.
    await setInvoicePublished(aInvoice.id, false, user.id);
    expect(await getPortalInvoiceDownloadUrl(await scopeFor(a.id), aInvoice.id)).toBeNull();
  });
});

describe("a scope cannot be forged", () => {
  it("rejects garbage, a wrong signature, and the wrong audience", async () => {
    const project = await createProject();

    expect(await portalScopeFromToken(undefined)).toBeNull();
    expect(await portalScopeFromToken("")).toBeNull();
    expect(await portalScopeFromToken("a.b.c")).toBeNull();

    const wrongSecret = await new SignJWT({ pv: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(project.id)
      .setIssuedAt()
      .setIssuer("kraken")
      .setAudience("kraken-portal")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("some-other-secret-at-least-32-chars-long"));
    expect(await portalScopeFromToken(wrongSecret)).toBeNull();

    const wrongAudience = await new SignJWT({ pv: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(project.id)
      .setIssuedAt()
      .setIssuer("kraken")
      .setAudience("kraken-internal")
      .setExpirationTime("1h")
      .sign(SECRET);
    expect(await portalScopeFromToken(wrongAudience)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const project = await createProject();
    const expired = await new SignJWT({ pv: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(project.id)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setIssuer("kraken")
      .setAudience("kraken-portal")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(SECRET);
    expect(await portalScopeFromToken(expired)).toBeNull();
  });

  it("rejects a token whose password version is stale after a rotation", async () => {
    const project = await createProject();
    const token = await signPortalSession(project.id, project.portal_password_version);
    expect(await portalScopeFromToken(token)).not.toBeNull();

    await sql`
      update projects
      set portal_password_hash = ${await hashPassword("rotated-password-here")},
          portal_password_version = portal_password_version + 1
      where id = ${project.id}
    `;
    expect(await portalScopeFromToken(token)).toBeNull();
  });

  it("rejects a token for an archived project", async () => {
    const project = await createProject();
    const token = await signPortalSession(project.id, project.portal_password_version);
    await sql`update projects set archived_at = now() where id = ${project.id}`;
    expect(await portalScopeFromToken(token)).toBeNull();
  });

  it("rejects a token for a project id that does not exist", async () => {
    const token = await signPortalSession("00000000-0000-0000-0000-000000000000", 1);
    expect(await portalScopeFromToken(token)).toBeNull();
  });
});

describe("the login lookup", () => {
  it("resolves by slug and returns no project data beyond identity", async () => {
    const project = await createProject({ slug: "lookup-me", name: "Lookup" });
    const target = await findProjectForLogin("lookup-me");
    expect(target?.id).toBe(project.id);
    // The hash is returned for verification only; assert nothing else leaks.
    expect(Object.keys(target ?? {}).sort()).toEqual(
      ["client_name", "id", "name", "portal_password_hash", "portal_password_version", "slug"].sort(),
    );
  });

  it("returns null for an unknown or archived slug", async () => {
    expect(await findProjectForLogin("nope")).toBeNull();
    const project = await createProject({ slug: "gone" });
    await sql`update projects set archived_at = now() where id = ${project.id}`;
    expect(await findProjectForLogin("gone")).toBeNull();
  });
});
