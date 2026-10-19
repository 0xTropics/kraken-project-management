import { chromium } from "@playwright/test";
import { BASE, PORTAL_PASSWORD, waitForHydration } from "./session.mjs";

const b = await chromium.launch();
const problems = [];
for (const [slug, width] of [["greenhouse-ops", 1440], ["dispatch-portal", 1440], ["greenhouse-ops", 390]]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/portal/${slug}`, { waitUntil: "domcontentloaded" });
  await waitForHydration(p);
  const f = p.locator('input[type="password"]');
  if (await f.count()) {
    await f.fill(PORTAL_PASSWORD);
    await Promise.all([
      p.waitForResponse((r) => r.url().includes("/login") && r.request().method() === "POST"),
      p.locator('button[type="submit"]').first().click(),
    ]);
    await p.reload({ waitUntil: "networkidle" });
  }
  await p.waitForTimeout(500);
  const info = await p.evaluate(() => ({
    docHeight: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
    hasTabs: !!document.querySelector('[role="navigation"][aria-label="Sections"]'),
    headerHeight: Math.round(document.querySelector("header")?.getBoundingClientRect().height ?? 0),
  }));
  console.log(`${slug} @${width}: ${(info.docHeight / info.viewport).toFixed(1)} screens, tabs=${info.hasTabs}, header=${info.headerHeight}px`);

  if (info.hasTabs) {
    // The last section must be reachable and become current.
    const last = await p.evaluate(() => {
      const links = [...document.querySelectorAll('[aria-label="Sections"] a')];
      return links[links.length - 1]?.getAttribute("href");
    });
    await p.click(`[aria-label="Sections"] a[href="${last}"]`);
    await p.waitForTimeout(700);
    const active = await p.evaluate(() =>
      document.querySelector('[aria-label="Sections"] a[aria-current="true"]')?.getAttribute("href"),
    );
    if (active !== last) problems.push(`${slug} @${width}: clicking ${last} left the highlight on ${active}`);
    else console.log(`  last tab ${last} reachable and highlighted`);
  }
  await ctx.close();
}

// Deep link on a genuinely cold load -- the "here is the link to your invoice"
// case, pasted into an email and opened fresh.
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const warm = await ctx.newPage();
await warm.goto(`${BASE}/portal/greenhouse-ops`, { waitUntil: "domcontentloaded" });
await waitForHydration(warm);
const f = warm.locator('input[type="password"]');
if (await f.count()) {
  await f.fill(PORTAL_PASSWORD);
  await Promise.all([
    warm.waitForResponse((r) => r.url().includes("/login") && r.request().method() === "POST"),
    warm.locator('button[type="submit"]').first().click(),
  ]);
}
await warm.close();

const p = await ctx.newPage();
await p.goto(`${BASE}/portal/greenhouse-ops#invoices`, { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const y = await p.evaluate(() => Math.round(window.scrollY));
const target = await p.evaluate(() =>
  Math.round(document.getElementById("invoices").getBoundingClientRect().top + window.scrollY),
);
console.log(`deep link #invoices: scrollY=${y} (section at ${target})`);
if (Math.abs(y - (target - 80)) > 24) {
  problems.push(`deep link #invoices landed at ${y}, expected about ${target - 80}`);
}
await b.close();
console.log(problems.length ? `PROBLEMS:\n  - ${problems.join("\n  - ")}` : "Portal nav: all checks passed.");
process.exit(problems.length ? 1 : 0);
