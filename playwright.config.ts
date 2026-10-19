import { defineConfig, devices } from "@playwright/test";

// The portal lockout counts failures per IP for 15 minutes and e2e makes deliberate wrong-password attempts, so each run gets its own address.
const RUN_IP = `2001:db8::${Date.now().toString(16).slice(-8).replace(/(.{4})(.{4})/, "$1:$2")}`;

/**
 * End-to-end checks against a running dev server with seeded data.
 * Start it yourself (`npm run dev`) or let Playwright do it.
 */
export default defineConfig({
  testDir: "./test/e2e",
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3100",
    extraHTTPHeaders: { "x-forwarded-for": RUN_IP },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    {
      // An iPhone viewport driven by Chromium: the phone-width behaviour is
      // what these specs assert, and requiring a WebKit download to run the
      // suite is friction without a matching payoff.
      name: "mobile",
      use: { ...devices["iPhone 14"], browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
