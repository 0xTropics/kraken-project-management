import { test, expect, portalSignIn } from "./fixtures";

/**
 * The portal end to end: a real sign-in, then the rendered page, confirming
 * that only approved, published content crosses to the client.
 */

test.describe("the portal shows only what has been approved and published", () => {
  test("renders updates and the board, and no internal content", async ({ page }) => {
    await portalSignIn(page, "greenhouse-ops");
    const body = (await page.locator("body").textContent()) ?? "";

    // An approved note is present.
    expect(body).toContain("Propagation calendar is live on staging");
    // Unapproved notes are not.
    expect(body).not.toContain("Blocked on confirmation of which window is the default");
    // Items the operator did not publish are not, whatever their type. Both of
    // these are chores, but that is not why they are hidden -- since 2026-09-05
    // `client_visible` is the whole rule, and both of these have it off.
    expect(body).not.toContain("Retire the legacy CSV importer");
    expect(body).not.toContain("Add integration tests around the scheduler");
    // ...and a chore the operator DID publish does reach the client, which is
    // the behaviour the type filter used to override.
    expect(body).toContain("Migrate the photo store to signed URLs");
    // No rate, no internal project note.
    expect(body).not.toContain("1Password");

    // The board is the overview, and money is not on it.
    expect(body).toContain("Planned");
    expect(body).toContain("In progress");
    expect(body).toContain("Done");
    expect(body).not.toContain("Outstanding");
  });

  test("a retainer project shows no hours, on either tab", async ({ page }) => {
    await portalSignIn(page, "dispatch-portal");

    const overview = (await page.locator("body").textContent()) ?? "";
    expect(overview).not.toContain("4,200");

    await page.goto("/portal/dispatch-portal?tab=invoices");
    const invoices = (await page.locator("body").textContent()) ?? "";
    // `getPortalHours` returns null for a retainer, so the tiles are absent --
    // not "0h", which would imply hours are counted and none were worked.
    expect(invoices).not.toContain("Hours this period");
    expect(invoices).not.toContain("Hours by period");
    expect(invoices).not.toContain("4,200");
  });
});
