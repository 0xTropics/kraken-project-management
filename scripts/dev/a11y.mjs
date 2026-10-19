#!/usr/bin/env node
/**
 * Accessibility audit across every surface, at desktop and phone widths, in
 * both colour schemes.
 *
 * Runs axe-core against the rendered page and reports serious and critical
 * violations only — the categories that actually stop someone using the
 * product (contrast, names, roles, landmarks, labels). Exits non-zero if any
 * are found, so it can gate a release alongside the overflow audit.
 *
 *   node scripts/dev/a11y.mjs [routeFilter...]
 */
import process from "node:process";
import { chromium } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { BASE, INTERNAL_EMAIL, ROUTES as ALL_ROUTES, portalSignIn, signIn } from "./session.mjs";

const ROUTES = ALL_ROUTES.filter(([name]) => name !== "portal-preview");

const VARIANTS = [
  { name: "desktop-light", width: 1440, scheme: "light" },
  { name: "mobile-dark", width: 390, scheme: "dark" },
];

const filters = process.argv.slice(2);
const selected = filters.length
  ? ROUTES.filter(([name]) => filters.some((f) => name.includes(f)))
  : ROUTES;

const browser = await chromium.launch();
const findings = [];

for (const variant of VARIANTS) {
  const make = () =>
    browser.newContext({
      viewport: { width: variant.width, height: 900 },
      colorScheme: variant.scheme,
      isMobile: variant.width < 500,
      hasTouch: variant.width < 500,
    });
  const contexts = { anon: await make(), internal: await make(), portal: await make() };

  const operator = await contexts.internal.newPage();
  await signIn(operator).catch(() => {});
  // A swallowed sign-in failure is worse than a crash: every "internal" route
  // then redirects to /login, axe scans the login page N times, and the run
  // reports no violations for pages it never opened. Fail loudly instead.
  const signedIn = !new URL(operator.url()).pathname.startsWith("/login");
  await operator.close();
  if (!signedIn) {
    console.error(
      `Could not sign in as ${INTERNAL_EMAIL}. Every internal route would silently scan the ` +
        `login page instead. Run \`npm run db:seed\`, or set KRAKEN_SEED_EMAIL and ` +
        `KRAKEN_SEED_PASSWORD to match the operator in your database.`,
    );
    await browser.close();
    process.exit(1);
  }

  const portalPage = await contexts.portal.newPage();
  await portalSignIn(portalPage, "greenhouse-ops");
  await portalPage.close();

  for (const [name, route, kind] of selected) {
    const page = await contexts[kind].newPage();
    try {
      const response = await page.goto(`${BASE}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      if ((response?.status() ?? 0) >= 400) continue;
      await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      for (const violation of results.violations) {
        if (violation.impact !== "serious" && violation.impact !== "critical") continue;
        findings.push(
          `${name} [${variant.name}] ${violation.id} (${violation.impact}) x${violation.nodes.length}\n` +
            `      ${violation.help}\n` +
            `      e.g. ${violation.nodes[0]?.html?.slice(0, 130)}`,
        );
      }
    } catch (error) {
      findings.push(`${name} [${variant.name}]: ${String(error).split("\n")[0]}`);
    } finally {
      await page.close();
    }
  }
  await Promise.all(Object.values(contexts).map((c) => c.close()));
}

await browser.close();

if (findings.length) {
  console.error(`Serious or critical accessibility violations (${findings.length}):\n  - ${findings.join("\n  - ")}`);
  process.exit(1);
}
console.log(`No serious or critical accessibility violations across ${selected.length} routes.`);
