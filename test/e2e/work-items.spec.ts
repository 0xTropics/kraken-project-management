import { test, expect, signIn } from "./fixtures";

/**
 * A project with no work items must still offer a way to create one.
 *
 * The seed gives every project work items, so the zero-item state -- the state
 * every real project starts in -- was reachable in production and by no test.
 * The empty state replaced the board, and the board is where the composer
 * lives, so the copy told you to "type a title and press Add" beside no input.
 */
test.describe("a project with no work items", () => {
  test("still offers a working composer on the board", async ({ page }) => {
    await signIn(page);

    // A brand new project, so the board is genuinely empty rather than
    // filtered empty.
    const clients = await page.request.get("/api/internal/clients");
    expect(clients.ok()).toBeTruthy();
    const { clients: list } = (await clients.json()) as { clients: { id: string }[] };
    const clientId = list[0]?.id;
    test.skip(!clientId, "no seeded client to hang a project on");

    const slug = `empty-board-${Date.now()}`;
    const created = await page.request.post("/api/internal/projects", {
      data: {
        client_id: clientId,
        name: `Empty Board ${slug}`,
        slug,
        billing_model: "hourly",
        currency: "USD",
        hourly_rate: 100,
        tax_rate: 0,
        portal_password: "empty-board-portal-password",
      },
    });
    expect(created.ok()).toBeTruthy();

    await page.goto(`/app/projects/${slug}/items`);

    // The composer must be present and usable, not merely described.
    const composer = page.locator('input[placeholder="Add…"]').first();
    await expect(composer).toBeVisible();

    await composer.fill("First item from an empty board");
    await composer.press("Enter");

    await expect(page.getByText("First item from an empty board")).toBeVisible();
  });

  test("still offers a composer in the list view", async ({ page }) => {
    await signIn(page);

    const clients = await page.request.get("/api/internal/clients");
    const { clients: list } = (await clients.json()) as { clients: { id: string }[] };
    const clientId = list[0]?.id;
    test.skip(!clientId, "no seeded client to hang a project on");

    const slug = `empty-list-${Date.now()}`;
    const created = await page.request.post("/api/internal/projects", {
      data: {
        client_id: clientId,
        name: `Empty List ${slug}`,
        slug,
        billing_model: "hourly",
        currency: "USD",
        hourly_rate: 100,
        tax_rate: 0,
        portal_password: "empty-list-portal-password",
      },
    });
    expect(created.ok()).toBeTruthy();

    await page.goto(`/app/projects/${slug}/items?view=list`);
    await expect(page.locator('input[placeholder="Add to backlog…"]').first()).toBeVisible();
  });
});
