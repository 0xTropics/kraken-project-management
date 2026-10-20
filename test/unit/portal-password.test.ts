import { describe, expect, it } from "vitest";
import { generatePortalPassword } from "@/components/projects/portal-password-input";

describe("generatePortalPassword", () => {
  it("is three groups of four unambiguous characters", () => {
    expect(generatePortalPassword()).toMatch(/^[a-hjkmnp-z2-9]{4}(-[a-hjkmnp-z2-9]{4}){2}$/);
  });

  // The old two-words-and-a-number shape had 34,200 values, so 1,000 draws
  // collided almost surely. A guessable space is the bug this guards.
  it("does not repeat across a thousand draws", () => {
    const drawn = new Set(Array.from({ length: 1000 }, generatePortalPassword));
    expect(drawn.size).toBe(1000);
  });
});
