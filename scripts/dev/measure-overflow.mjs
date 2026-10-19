#!/usr/bin/env node
/**
 * Overflow audit -- horizontal, and one specific vertical case.
 *
 * A page that scrolls sideways on a phone is the most common and least visible
 * responsive defect: screenshots look plausible because the overflowing content
 * is simply off-frame. This walks every surface and reports any element whose
 * box escapes the viewport, naming the element so the fix is obvious.
 *
 * It also checks a vertical invariant: **a page that owns a layout scroller
 * must not also scroll the document.** When `<main>` contains a `flex-1
 * overflow-y-auto` region, that region is meant to be the only thing that
 * scrolls; a scrolling document on top of it means something escaped, and the
 * user gets two scrollbars and a sidebar whose `sticky` runs out of runway.
 *
 * The escape route is always the same: an absolutely-positioned descendant
 * with no positioned ancestor resolves against the initial containing block,
 * so it is neither laid out inside the scroller nor clipped by it. Tailwind's
 * `sr-only` is `position: absolute`, which is how visually-hidden form labels
 * on a long tab silently added 1149px to the document (fixed by making the
 * scroller `relative`). The failure names the escapees for the same reason the
 * horizontal check names its offenders.
 *
 *   node scripts/dev/measure-overflow.mjs [routeFilter...]
 *
 * Exits non-zero if anything overflows, so it can gate a release.
 */
import process from "node:process";
import { chromium } from "@playwright/test";
import { BASE, ROUTES as ALL_ROUTES, portalSignIn, signIn } from "./session.mjs";

// 1440 is here for the vertical check: a layout scroller escaping is a desktop
// symptom, and the two phone widths would not have caught it.
const WIDTHS = [390, 768, 1440];

const ROUTES = ALL_ROUTES.filter(([name]) => name !== "portal-login");

const filters = process.argv.slice(2);
const selected = filters.length
  ? ROUTES.filter(([name]) => filters.some((f) => name.includes(f)))
  : ROUTES;

const browser = await chromium.launch();
const problems = [];

for (const width of WIDTHS) {
  const contexts = {
    anon: await browser.newContext({ viewport: { width, height: 844 } }),
    internal: await browser.newContext({ viewport: { width, height: 844 } }),
    portal: await browser.newContext({ viewport: { width, height: 844 } }),
  };

  const operator = await contexts.internal.newPage();
  await signIn(operator).catch(() => {});
  await operator.close();

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
      if ((response?.status() ?? 0) >= 400) {
        problems.push(`${name} @${width}: HTTP ${response?.status()}`);
        continue;
      }
      await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
      const result = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const offenders = [];
        for (const el of document.querySelectorAll("body *")) {
          const style = getComputedStyle(el);
          if (style.position === "fixed" || style.display === "none") continue;
          // An element that scrolls on purpose is allowed to be wider inside.
          if (style.overflowX === "auto" || style.overflowX === "scroll") continue;
          let parent = el.parentElement;
          let insideScroller = false;
          while (parent) {
            const ps = getComputedStyle(parent);
            if (ps.overflowX === "auto" || ps.overflowX === "scroll") {
              insideScroller = true;
              break;
            }
            parent = parent.parentElement;
          }
          if (insideScroller) continue;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > vw + 1) {
            offenders.push(
              `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 70)}"> right=${Math.round(r.right)}`,
            );
          }
        }
        const de = document.documentElement;

        // A layout scroller: flex-grow 1 plus its own vertical overflow. The
        // flex-grow test is what keeps a textarea or a small code block from
        // being mistaken for one.
        const main = document.querySelector("main");
        const layoutScroller = main
          ? [...main.querySelectorAll("*")].some((el) => {
              const s = getComputedStyle(el);
              return s.flexGrow === "1" && (s.overflowY === "auto" || s.overflowY === "scroll");
            })
          : false;

        // Anything absolutely positioned whose containing block is the initial
        // one -- i.e. no positioned ancestor -- and which sits below the fold.
        const escapees = [];
        if (layoutScroller) {
          for (const el of document.querySelectorAll("body *")) {
            if (getComputedStyle(el).position !== "absolute") continue;
            let n = el.parentElement;
            let contained = false;
            while (n) {
              const ps = getComputedStyle(n);
              if (
                ps.position !== "static" ||
                ps.transform !== "none" ||
                ps.filter !== "none" ||
                ps.perspective !== "none"
              ) {
                contained = true;
                break;
              }
              n = n.parentElement;
            }
            if (contained) continue;
            const r = el.getBoundingClientRect();
            if (r.bottom + window.scrollY > de.clientHeight + 1) {
              escapees.push(
                `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 60)}"> bottom=${Math.round(r.bottom + window.scrollY)}`,
              );
            }
          }
        }

        return {
          vw,
          scrollWidth: de.scrollWidth,
          offenders,
          layoutScroller,
          scrollHeight: de.scrollHeight,
          clientHeight: de.clientHeight,
          escapees,
        };
      });
      if (result.scrollWidth > result.vw + 1) {
        problems.push(
          `${name} @${width}: scrollWidth ${result.scrollWidth} > ${result.vw}\n      ${result.offenders.slice(0, 3).join("\n      ")}`,
        );
      }
      if (result.layoutScroller && result.scrollHeight > result.clientHeight + 1) {
        const found = result.escapees.length
          ? `\n      escaped the scroller (absolute, no positioned ancestor):\n      ${result.escapees.slice(0, 3).join("\n      ")}`
          : "";
        problems.push(
          `${name} @${width}: page owns a layout scroller but the document scrolls too — ` +
            `scrollHeight ${result.scrollHeight} > ${result.clientHeight}${found}`,
        );
      }
    } catch (error) {
      problems.push(`${name} @${width}: ${error.message.split("\n")[0]}`);
    } finally {
      await page.close();
    }
  }
  await Promise.all(Object.values(contexts).map((c) => c.close()));
}

await browser.close();

if (problems.length) {
  console.error(`Overflow found on ${problems.length} surface(s):\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(
  `No horizontal overflow, and no page scrolling the document behind its own layout scroller, ` +
    `across ${selected.length} routes at ${WIDTHS.join("px, ")}px.`,
);
