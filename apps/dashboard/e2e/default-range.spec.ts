import { test, expect } from "@playwright/test";

// Verifies the FilterBar's range trigger reflects DASHBOARD_DEFAULT_RANGE
// (server-injected via the root loader) when no URL search params are
// present. The e2e environment sets the default to `7d`, which renders as
// "Last 7d" on the new range button.
//
// The range trigger is a Popover button labelled `Range: <human label>`.

test.describe("default time range (env-driven via root loader)", () => {
  test.beforeEach(async ({ page, context }) => {
    // Clean slate — no localStorage prefs, no cookies — so the only
    // signal for the initial Range value is the server-injected default.
    await context.clearCookies();
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        // ignore
      }
    });
  });

  test("FilterBar initial range is Last 7d when URL has no ?range param", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});

    const rangeBtn = page.getByTestId("range-trigger");
    await expect(rangeBtn).toBeVisible({ timeout: 10_000 });
    await expect(rangeBtn).toHaveAttribute("aria-label", /Last 7d/);
  });

  test("URL ?range=24h overrides the env default", async ({ page }) => {
    await page.goto("/?range=24h");
    await page.waitForLoadState("networkidle").catch(() => {});

    const rangeBtn = page.getByTestId("range-trigger");
    await expect(rangeBtn).toBeVisible({ timeout: 10_000 });
    await expect(rangeBtn).toHaveAttribute("aria-label", /Last 24h/);
  });
});
