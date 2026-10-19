import { describe, expect, it } from "vitest";
import { portalLoginErrorMessage } from "@/lib/portal/login-error";

describe("portalLoginErrorMessage", () => {
  it("shows the server's lockout message for a 429", () => {
    expect(
      portalLoginErrorMessage(429, { error: "Too many attempts. Try again in a few minutes." }),
    ).toBe("Too many attempts. Try again in a few minutes.");
  });

  it("falls back to the lockout message when a 429 has no readable body", () => {
    expect(portalLoginErrorMessage(429, null)).toBe(
      "Too many attempts. Try again in a few minutes.",
    );
  });

  it("falls back to the lockout message when a 429's error is not a readable string", () => {
    for (const error of [{ code: "locked" }, "", "   "]) {
      expect(portalLoginErrorMessage(429, { error })).toBe(
        "Too many attempts. Try again in a few minutes.",
      );
    }
  });

  it("keeps the wrong-password wording for a 401", () => {
    expect(portalLoginErrorMessage(401, { error: "That password was not accepted" })).toBe(
      "That password was not accepted. Check it and try again.",
    );
  });

  it("does not claim the password was wrong for a server error", () => {
    expect(portalLoginErrorMessage(500, null)).toBe("Something went wrong. Try again in a moment.");
  });
});
