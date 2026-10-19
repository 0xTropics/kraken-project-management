import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A layout's session check does not stop the page beneath it: the router
 * renders each segment on its own, and an unchecked page still lands in the
 * RSC payload. So every page, layout, and generateMetadata under /app must open
 * with `await requireInternalPage(` before it touches any data.
 */
const ROOT = path.join(process.cwd(), "src/app/app");
const files = readdirSync(ROOT, { recursive: true, encoding: "utf8" })
  .filter((file) => ["page.tsx", "layout.tsx"].includes(path.basename(file)))
  .sort();

describe("every internal page checks the session itself", () => {
  it("finds the pages", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files)("%s", (file) => {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    // A function body that opens with the check: `{ await requireInternalPage(`.
    const opening = source.match(/\{\s*(?:const \w+ = )?await requireInternalPage\(/g) ?? [];
    const entryPoints = 1 + (source.match(/function generateMetadata\(/g) ?? []).length;
    expect(opening.length, "each entry point's first statement").toBeGreaterThanOrEqual(entryPoints);
  });
});
