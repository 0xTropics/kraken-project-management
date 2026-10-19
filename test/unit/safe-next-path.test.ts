import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/next-path";

describe("safeNextPath keeps the post-sign-in redirect inside the internal app", () => {
  it.each(["/app", "/app?x=1", "/app/clients?x=1", "/app/projects/greenhouse-ops/items"])("keeps %j", (next) => {
    expect(safeNextPath(next)).toBe(next);
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/app/\\evil.example",
    "/app/\n",
    "/app/..//evil.example",
    "/app/../login",
    "/app/%2e%2e//evil",
    "https://evil.example",
    "javascript:alert(1)",
    "/login",
    "/apple",
    "",
    null,
    undefined,
    ["/app/clients"],
  ])("falls back to /app for %j", (next) => {
    expect(safeNextPath(next)).toBe("/app");
  });
});
