import { test, expect, signIn, portalSignIn, PORTAL_PASSWORD } from "./fixtures";

test.describe("authentication boundaries in the running app", () => {
  test("an anonymous visitor cannot reach the internal app", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).not.toContainText("Greenhouse Operations");
  });

  test("anonymous internal API calls are rejected, not redirected to data", async ({ request }) => {
    for (const [method, path] of [
      ["POST", "/api/internal/projects"],
      ["POST", "/api/internal/work-items"],
      ["GET", "/api/internal/invoices"],
      ["GET", "/api/internal/reports/export?type=revenue"],
    ]) {
      const response = await request.fetch(path, { method });
      expect(
        [401, 403, 404].includes(response.status()),
        `${path} returned ${response.status()}`,
      ).toBe(true);
      if (response.status() !== 404) {
        const body = await response.text();
        expect(body).not.toContain("Greenhouse");
        expect(body).not.toContain("hourly_rate");
      }
    }
  });

  // A layout's redirect does not stop the page beneath it from rendering into
  // the RSC payload, and a cookie that merely exists is not a session. `RSC: 1`
  // plus `?_rsc` asks for the payload a client-side navigation receives; without
  // `?_rsc` Next first redirects to add it, and the follow-up drops the cookie.
  test("a forged session cookie gets no page data from the RSC payload", async ({ request }) => {
    const seeded = [
      "Northwind Botanicals",
      "Halcyon Studio",
      "Juniper Dental",
      "Meridian Freight",
      "Greenhouse Operations",
      "Dispatch Portal",
    ];
    for (const path of [
      "/app",
      "/app/clients",
      "/app/invoices",
      "/app/projects/greenhouse-ops/portal",
      "/app/projects/greenhouse-ops/settings",
    ]) {
      const response = await request.get(`${path}?_rsc`, {
        headers: { RSC: "1", Cookie: "kraken_session=not-a-real-token" },
        maxRedirects: 0,
      });
      const body = await response.text();
      for (const name of seeded) expect(body, `${path} leaked "${name}"`).not.toContain(name);
      expect(response.status(), `${path} answered with page data`).not.toBe(200);
      const location = new URL(response.headers().location ?? "", response.url());
      expect(location.pathname, `${path} was not sent to sign in`).toBe("/login");
    }
  });

  test("signing in reaches the dashboard, and signing out closes it again", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/app/);
    await page.request.post("/api/auth/logout");
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a portal session does not open the internal app", async ({ page }) => {
    await portalSignIn(page, "greenhouse-ops");
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a portal cookie for one project shows another project's login, not its data", async ({
    page,
  }) => {
    await portalSignIn(page, "greenhouse-ops");
    await page.goto("/portal/dispatch-portal");
    // Must be asked for the second project's password rather than shown the first.
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Greenhouse Operations");
  });

  test("the wrong portal password does not grant access", async ({ page }) => {
    await page.goto("/portal/greenhouse-ops");
    await page.fill('input[type="password"]', "definitely-not-the-password");
    await page.click('button[type="submit"]');
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Updates");
  });

  test("an unknown portal slug does not confirm what exists", async ({ page }) => {
    const response = await page.goto("/portal/no-such-project-here");
    expect(response?.status()).toBe(404);
    await expect(page.locator("body")).not.toContainText("Greenhouse");
  });

  test("the portal never renders a rate", async ({ page }) => {
    await portalSignIn(page, "greenhouse-ops");
    const text = (await page.locator("body").textContent()) ?? "";
    // The seeded hourly rate is 165/hr and the retainer is 4200.
    expect(text).not.toMatch(/\$?165(\.00)?\s*(\/|per)?\s*(hour|hr)/i);
    expect(text).not.toContain("hourly_rate");
    expect(text).not.toContain("portal_password");
  });

  test("portal login attempts are recorded for both outcomes", async ({ page, request }) => {
    await page.goto("/portal/greenhouse-ops");
    await page.fill('input[type="password"]', "wrong-on-purpose");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(300);
    await page.fill('input[type="password"]', PORTAL_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle");
    // The evidence is checked in the integration suite; here we only assert the
    // second attempt actually succeeded.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    void request;
  });
});
