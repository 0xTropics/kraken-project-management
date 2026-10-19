#!/usr/bin/env node
/**
 * Screenshot harness. Signs in once, then captures every named surface at
 * desktop and mobile widths in both themes.
 *
 *   node scripts/shots.mjs                    # everything
 *   node scripts/shots.mjs dashboard board    # only matching targets
 *   OUT=docs/evidence/my-run node scripts/shots.mjs
 *
 * Requires the dev server on :3100 and seeded data.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { BASE, portalSignIn, signIn } from "./dev/session.mjs";

const OUT = path.resolve(process.env.OUT ?? "docs/evidence/current");

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

/** name, path, options */
const TARGETS = [
  ["login", "/login", { anonymous: true }],
  ["dashboard", "/app"],
  ["requests", "/app/requests"],
  ["projects", "/app/projects"],
  ["project-overview", "/app/projects/greenhouse-ops"],
  // Wide enough for all five columns (the board scrolls sideways at 1440), at
  // the same 16:10 as the other desktop shots.
  ["board", "/app/projects/greenhouse-ops/items", { desktop: { width: 1960, height: 1225 } }],
  ["list", "/app/projects/greenhouse-ops/items?view=list"],
  ["notes", "/app/projects/greenhouse-ops/notes"],
  ["time-project", "/app/projects/greenhouse-ops/time"],
  ["invoices-project", "/app/projects/greenhouse-ops/invoices"],
  ["project-settings", "/app/projects/greenhouse-ops/settings"],
  ["portal-preview", "/app/projects/greenhouse-ops/portal"],
  ["time", "/app/time"],
  ["time-new", "/app/time/new"],
  ["invoices", "/app/invoices"],
  ["reports", "/app/reports"],
  ["clients", "/app/clients"],
  ["settings", "/app/settings"],
  ["settings-audit", "/app/settings/audit"],
  ["portal-login", "/portal/greenhouse-ops", { anonymous: true }],
  ["portal", "/portal/greenhouse-ops", { portal: true }],
  ["portal-invoices", "/portal/greenhouse-ops?tab=invoices", { portal: true }],
  ["portal-requests", "/portal/greenhouse-ops?tab=requests", { portal: true }],
  ["portal-retainer", "/portal/dispatch-portal", { portal: true, portalSlug: "dispatch-portal" }],
];

/**
 * Two of the most important screens live behind ids, not slugs. Resolve one
 * draft and one finalized invoice up front and append them as targets.
 */
async function resolveInvoiceTargets(context) {
  const page = await context.newPage();
  try {
    const response = await page.request.get(`${BASE}/api/internal/invoices`);
    if (!response.ok()) return [];
    const body = await response.json();
    const invoices = Array.isArray(body) ? body : (body.invoices ?? []);
    const draft = invoices.find((i) => i.status === "draft");
    // The richest finalized invoice on the project every other shot shows.
    const finalized = invoices
      .filter((i) => (i.status === "paid" || i.status === "sent") && i.project_slug === "greenhouse-ops")
      .sort((a, b) => b.line_count - a.line_count)[0];
    const voided = invoices.find((i) => i.status === "void");
    return [
      draft && ["invoice-draft", `/app/invoices/${draft.id}`, {}],
      finalized && ["invoice-finalized", `/app/invoices/${finalized.id}`, {}],
      voided && ["invoice-void", `/app/invoices/${voided.id}`, {}],
    ].filter(Boolean);
  } catch {
    return [];
  } finally {
    await page.close();
  }
}

const filters = process.argv.slice(2);
const selected = filters.length
  ? TARGETS.filter(([name]) => filters.some((f) => name.includes(f)))
  : TARGETS;

const browser = await chromium.launch();
const failures = [];

async function newContext({ viewport, theme }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    colorScheme: theme,
    isMobile: viewport.width < 500,
    hasTouch: viewport.width < 500,
  });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem("kraken-theme", t);
    } catch {}
  }, theme);
  return context;
}

for (const [size, viewport] of Object.entries(VIEWPORTS)) {
  for (const theme of ["light", "dark"]) {
    const authed = await newContext({ viewport, theme });
    const anon = await newContext({ viewport, theme });
    const portal = await newContext({ viewport, theme });
    try {
      const page = await authed.newPage();
      await signIn(page);
      await page.close();
    } catch (error) {
      failures.push(`sign-in (${size}/${theme}): ${error.message}`);
    }
    try {
      const page = await portal.newPage();
      await portalSignIn(page, "greenhouse-ops");
      await page.close();
    } catch (error) {
      failures.push(`portal sign-in (${size}/${theme}): ${error.message}`);
    }

    const extra = await resolveInvoiceTargets(authed);
    const withExtra = filters.length
      ? [...selected, ...extra.filter(([n]) => filters.some((f) => n.includes(f)))]
      : [...selected, ...extra];

    for (const [name, route, options = {}] of withExtra) {
      const context = options.anonymous ? anon : options.portal ? portal : authed;
      const page = await context.newPage();
      if (size === "desktop" && options.desktop) await page.setViewportSize(options.desktop);
      const consoleErrors = [];
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text());
      });
      try {
        // One portal cookie at a time: this re-signs the shared portal context,
        // so a portalSlug target must stay after the greenhouse-ops ones.
        if (options.portalSlug) await portalSignIn(page, options.portalSlug);
        const response = await page.goto(`${BASE}${route}`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(250);
        const dir = path.join(OUT, size, theme);
        await mkdir(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false });
        const status = response?.status() ?? 0;
        if (status >= 400) failures.push(`${name} (${size}/${theme}): HTTP ${status}`);
        if (consoleErrors.length) {
          failures.push(
            `${name} (${size}/${theme}): console error — ${consoleErrors[0].slice(0, 200)}`,
          );
        }
      } catch (error) {
        failures.push(`${name} (${size}/${theme}): ${error.message}`);
      } finally {
        await page.close();
      }
    }
    await Promise.all([authed.close(), anon.close(), portal.close()]);
  }
}

await browser.close();
await mkdir(OUT, { recursive: true });
await writeFile(
  path.join(OUT, "report.txt"),
  failures.length ? failures.join("\n") : "All targets captured with no console errors.\n",
);
console.log(
  failures.length
    ? `Captured with ${failures.length} problem(s):\n  ${failures.join("\n  ")}`
    : `Captured ${selected.length}+ targets x 4 variants into ${OUT} with no console errors.`,
);
process.exit(0);
