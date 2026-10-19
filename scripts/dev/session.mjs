/**
 * What the browser scripts and the Playwright suite (test/e2e/fixtures.ts)
 * share: where the dev server is, the seeded logins, and how to sign in.
 */
import process from "node:process";

export const BASE = process.env.BASE_URL ?? "http://localhost:3100";
export const INTERNAL_EMAIL = process.env.KRAKEN_SEED_EMAIL ?? "operator@example.com";
export const INTERNAL_PASSWORD = process.env.KRAKEN_SEED_PASSWORD ?? "Password";
export const PORTAL_PASSWORD = process.env.PORTAL_PASSWORD ?? "seagrass-lantern-42";

/** An unhydrated form falls back to a native submit, which never hits the API. */
export async function waitForHydration(page) {
  await page
    .waitForFunction(() => document.documentElement.dataset.hydrated === "1", { timeout: 20000 })
    .catch(() => {});
}

/** Signs the operator in. Throws if the page never leaves /login. */
export async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await page.fill('input[name="email"]', INTERNAL_EMAIL);
  await page.fill('input[name="password"]', INTERNAL_PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login")),
    page.click('button[type="submit"]'),
  ]);
}

/** Signs in to a project's portal, if it is not signed in already. */
export async function portalSignIn(page, slug) {
  await page.goto(`${BASE}/portal/${slug}`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  const field = page.locator('input[type="password"]').first();
  if (await field.count()) {
    await field.fill(PORTAL_PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForLoadState("networkidle").catch(() => {});
  }
}

/** [name, path, context] for the route-walking audits (a11y, overflow). */
export const ROUTES = [
  ["login", "/login", "anon"],
  ["dashboard", "/app", "internal"],
  ["requests", "/app/requests", "internal"],
  ["projects", "/app/projects", "internal"],
  ["project-new", "/app/projects/new", "internal"],
  ["project-overview", "/app/projects/greenhouse-ops", "internal"],
  ["board", "/app/projects/greenhouse-ops/items", "internal"],
  ["list", "/app/projects/greenhouse-ops/items?view=list", "internal"],
  ["notes", "/app/projects/greenhouse-ops/notes", "internal"],
  ["project-time", "/app/projects/greenhouse-ops/time", "internal"],
  ["project-invoices", "/app/projects/greenhouse-ops/invoices", "internal"],
  ["project-settings", "/app/projects/greenhouse-ops/settings", "internal"],
  ["maintenance-overview", "/app/projects/juniper-site", "internal"],
  ["maintenance-invoices", "/app/projects/juniper-site/invoices", "internal"],
  ["maintenance-settings", "/app/projects/juniper-site/settings", "internal"],
  ["portal-preview", "/app/projects/greenhouse-ops/portal", "internal"],
  ["time", "/app/time", "internal"],
  ["time-new", "/app/time/new", "internal"],
  ["invoices", "/app/invoices", "internal"],
  ["reports", "/app/reports", "internal"],
  ["clients", "/app/clients", "internal"],
  ["settings", "/app/settings", "internal"],
  ["audit", "/app/settings/audit", "internal"],
  ["portal-login", "/portal/greenhouse-ops", "anon"],
  ["portal", "/portal/greenhouse-ops", "portal"],
  ["portal-invoices", "/portal/greenhouse-ops?tab=invoices", "portal"],
  ["portal-requests", "/portal/greenhouse-ops?tab=requests", "portal"],
];
