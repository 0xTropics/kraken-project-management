import { test, expect, signIn } from "./fixtures";

test("the account card describes local-mode passwords", async ({ page }) => {
  await signIn(page);
  await page.goto("/app/settings");
  await expect(
    page.getByText("Kraken stores your password on this server."),
  ).toBeVisible();
  await expect(page.getByText("npm run operator:password")).toBeVisible();
  await expect(page.getByText("Supabase Auth")).toHaveCount(0);
});
