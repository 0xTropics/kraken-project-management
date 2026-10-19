import { test, expect, signIn, portalSignIn, PORTAL_PASSWORD } from "./fixtures";

/**
 * A client request end to end: submitted in the portal with an image, triaged
 * in Kraken, and its new status read back in the portal.
 *
 * Each run makes its own project. Requests are capped at ten a day per project,
 * so a test that always posted to a seeded project would start failing on its
 * own rate limit after a few runs without a reseed.
 */

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("a client request travels from the portal to the board and back", async ({ browser }, testInfo) => {
  const operator = await (await browser.newContext()).newPage();
  await signIn(operator);

  const clients = await operator.request.get("/api/internal/clients");
  expect(clients.ok()).toBeTruthy();
  const { clients: list } = (await clients.json()) as { clients: { id: string }[] };
  const clientId = list[0]?.id;
  test.skip(!clientId, "no seeded client to hang a project on");

  const slug = `requests-${testInfo.project.name}-${Date.now()}`;
  const created = await operator.request.post("/api/internal/projects", {
    data: {
      client_id: clientId,
      name: `Requests ${slug}`,
      slug,
      billing_model: "hourly",
      currency: "USD",
      hourly_rate: 100,
      tax_rate: 0,
      portal_password: PORTAL_PASSWORD,
    },
  });
  expect(created.ok()).toBeTruthy();

  const title = `E2E request ${Date.now()}`;
  const client = await (await browser.newContext()).newPage();
  await portalSignIn(client, slug);
  await client.goto(`/portal/${slug}?tab=requests`);
  await client.getByLabel("Title").fill(title);
  await client.getByLabel("What do you need, and why?").fill("So the auditors can work offline.");
  await client.getByLabel("Your name").fill("Priya");
  await client
    .locator('input[type="file"]')
    .setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: PNG });
  await client.getByRole("button", { name: "Send request" }).click();
  await expect(client.getByRole("status")).toContainText("Request sent");
  const row = client.locator("li", { hasText: title });
  await expect(row).toContainText("Submitted");
  await expect
    .poll(() => row.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);

  await operator.goto("/app/requests");
  await operator.getByRole("link", { name: new RegExp(title) }).click();
  await operator.getByRole("button", { name: "Accept → backlog" }).click();
  await expect(operator.getByRole("link", { name: "Open work item" })).toBeVisible();

  await client.reload();
  await expect(client.locator("li", { hasText: title })).toContainText("Accepted");
});
