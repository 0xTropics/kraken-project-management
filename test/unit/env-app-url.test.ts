import { afterEach, describe, expect, it } from "vitest";
import { env } from "@/lib/env";

/**
 * `KRAKEN_APP_URL` is the one environment value that gets parsed rather than
 * only interpolated, so a malformed setting is not cosmetic.
 *
 * A schemeless value breaks portal sign-out: `new URL("/portal/x",
 * "kraken.example.com")` throws, the route returns a 500 before it can clear
 * the cookie, and the client is signed straight back in on their next visit.
 */

const ORIGINAL = process.env.KRAKEN_APP_URL;
const FALLBACK = "http://localhost:3100";

afterEach(() => {
  process.env.KRAKEN_APP_URL = ORIGINAL;
});

describe("env.appUrl", () => {
  it("uses the value as given when it is a well-formed origin", () => {
    process.env.KRAKEN_APP_URL = "https://kraken.example.app";
    expect(env.appUrl).toBe("https://kraken.example.app");
  });

  it("strips a single trailing slash", () => {
    process.env.KRAKEN_APP_URL = "https://kraken.example.app/";
    expect(env.appUrl).toBe("https://kraken.example.app");
  });

  it("falls back to localhost when unset", () => {
    delete process.env.KRAKEN_APP_URL;
    expect(env.appUrl).toBe(FALLBACK);
  });

  it("treats an empty value as unset", () => {
    // `?? fallback` does not catch "", so an empty variable used to survive as
    // an empty string and throw at the point of use instead.
    process.env.KRAKEN_APP_URL = "";
    expect(env.appUrl).toBe(FALLBACK);
  });

  it("treats a whitespace-only value as unset", () => {
    process.env.KRAKEN_APP_URL = "   ";
    expect(env.appUrl).toBe(FALLBACK);
  });

  it("repairs a bare host that is missing its scheme", () => {
    process.env.KRAKEN_APP_URL = "kraken.example.com";
    expect(env.appUrl).toBe("https://kraken.example.com");
  });

  it("repairs a bare host that carries a path or port", () => {
    process.env.KRAKEN_APP_URL = "kraken.example.app:8443";
    expect(env.appUrl).toBe("https://kraken.example.app:8443");
  });

  it("always yields something `new URL` can use as a base", () => {
    for (const value of ["https://a.example", "a.example", "", "   ", "a.example/"]) {
      process.env.KRAKEN_APP_URL = value;
      expect(() => new URL("/portal/x?signed-out=1", env.appUrl)).not.toThrow();
    }
  });

  it("names the variable when the value cannot be repaired", () => {
    process.env.KRAKEN_APP_URL = "http://";
    expect(() => env.appUrl).toThrow(/KRAKEN_APP_URL/);
  });
});
