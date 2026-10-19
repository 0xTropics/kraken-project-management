/**
 * Exercises the ⌘K command palette end to end: open by shortcut, filter,
 * keyboard-select, and confirm it navigates. Also checks Escape closes it and
 * that the sidebar toggle shortcut works.
 */
import { chromium } from "@playwright/test";
import { signIn } from "./session.mjs";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const problems = [];

await signIn(page);
await page.waitForLoadState("networkidle");

// Open with the keyboard.
await page.keyboard.press("Meta+k");
const dialog = page.getByRole("dialog");
if (!(await dialog.isVisible().catch(() => false))) problems.push("Cmd+K did not open the palette");

const shell = await dialog.boundingBox();
if (shell) console.log(`palette width: ${Math.round(shell.width)}px (Plane's Power K is 672px)`);

// Section headings.
const headings = await page.locator("[cmdk-group-heading]").allTextContents();
console.log("sections:", headings.join(", "));

// Type to filter, then choose with the keyboard.
await page.keyboard.type("dispatch");
await page.waitForTimeout(250);
const visible = await page.locator("[cmdk-item]:visible").allTextContents();
console.log("filtered to:", visible.slice(0, 5).join(" | "));
if (!visible.some((t) => /Dispatch/i.test(t))) problems.push("filtering did not surface Dispatch Portal");

await page.keyboard.press("Enter");
// Client-side navigation: wait for the URL itself, not for the network.
await page
  .waitForURL((u) => u.pathname.includes("dispatch-portal"), { timeout: 8000 })
  .catch(() => {});
await page.waitForLoadState("networkidle").catch(() => {});
console.log("navigated to:", new URL(page.url()).pathname);
if (!page.url().includes("dispatch-portal")) problems.push("Enter did not navigate to the selected project");

// Escape closes.
await page.keyboard.press("Meta+k");
await page.waitForTimeout(150);
await page.keyboard.press("Escape");
await page.waitForTimeout(250);
if (await page.getByRole("dialog").isVisible().catch(() => false)) problems.push("Escape did not close the palette");

// Empty state.
await page.keyboard.press("Meta+k");
await page.keyboard.type("zzzzzzzz");
await page.waitForTimeout(250);
const empty = await page.locator("text=/Nothing matches/").isVisible().catch(() => false);
if (!empty) problems.push("no empty state for a query that matches nothing");
await page.keyboard.press("Escape");

// Sidebar collapse shortcut.
const before = await page.locator("aside").boundingBox();
await page.keyboard.press("Meta+\\");
await page.waitForTimeout(350);
const after = await page.locator("aside").boundingBox();
console.log(`sidebar width ${Math.round(before?.width ?? 0)} -> ${Math.round(after?.width ?? 0)}`);
if ((after?.width ?? 0) >= (before?.width ?? 1)) problems.push("Cmd+\\ did not collapse the sidebar");

await browser.close();
console.log(problems.length ? `PROBLEMS:\n  - ${problems.join("\n  - ")}` : "Command palette: all checks passed.");
process.exit(problems.length ? 1 : 0);
