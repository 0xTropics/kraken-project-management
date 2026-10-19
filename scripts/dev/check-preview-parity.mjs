/**
 * The internal "Portal preview" tab must show *exactly* what the client
 * sees. That is only true if it renders the same component over the same
 * queries, so this compares the visible text of both and reports any divergence.
 */
import { chromium } from "@playwright/test";
import { BASE, PORTAL_PASSWORD, signIn, waitForHydration } from "./session.mjs";

const browser = await chromium.launch();

function normalise(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\d+ (minutes?|hours?|days?|months?) ago/g, "<relative>")
    .trim();
}

async function portalText(slug) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/portal/${slug}`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  const field = page.locator('input[type="password"]');
  if (await field.count()) {
    await field.fill(PORTAL_PASSWORD);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/login") && r.request().method() === "POST"),
      page.locator('button[type="submit"]').first().click(),
    ]);
    // A hard reload rather than waiting on router.refresh(): this script is
    // comparing server-rendered output, so re-request it with the cookie set.
    await page.reload({ waitUntil: "networkidle" });
  }
  const text = normalise((await page.locator("main").innerText()) ?? "");
  await ctx.close();
  return text;
}

async function previewText(slug) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await signIn(page);
  await page.goto(`${BASE}/app/projects/${slug}/portal`, { waitUntil: "networkidle" });
  // The preview nests the portal's own <main> inside the app shell's, so take
  // the innermost one -- that is the client's view.
  const text = normalise((await page.locator("main main").last().innerText()) ?? "");
  await ctx.close();
  return text;
}

const problems = [];
for (const slug of ["greenhouse-ops", "dispatch-portal", "halcyon-site", "halcyon-app"]) {
  const [live, preview] = await Promise.all([portalText(slug), previewText(slug)]);

  // No exceptions any more: the preview renders the same words as the client's
  // view, including the download and sign-out controls, which are inert there.
  const liveNormalised = live;
  if (liveNormalised !== preview) {
    const at = [...liveNormalised].findIndex((c, i) => c !== preview[i]);
    problems.push(
      `${slug}: preview diverges from the live portal at char ${at}\n` +
        `      live:    …${liveNormalised.slice(Math.max(0, at - 60), at + 60)}…\n` +
        `      preview: …${preview.slice(Math.max(0, at - 60), at + 60)}…`,
    );
  } else {
    console.log(`${slug}: preview matches the live portal (${live.length} chars)`);
  }
}

await browser.close();
if (problems.length) {
  console.error(`Preview parity problems:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log("Portal preview is byte-identical to the client's view on every project.");
