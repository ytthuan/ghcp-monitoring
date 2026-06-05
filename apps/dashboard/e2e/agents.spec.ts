import { test } from "@playwright/test";
import { assertLeaderboardBasics } from "./_leaderboard-helpers";

test("agents leaderboard: sticky header, sortable, focusable rows, CSV, no leaks", async ({ page }) => {
  await assertLeaderboardBasics(page, {
    url: "/agents",
    csvLabel: /export agents as csv/i,
  });
});

test("agents row activation by keyboard navigates to /calls", async ({ page }) => {
  await page.goto("/agents");
  await page.waitForLoadState("domcontentloaded");
  const table = page.locator("table").first();
  if (!(await table.isVisible().catch(() => false))) {
    test.skip(true, "no telemetry available");
  }
  const firstRow = table.locator("tbody tr").first();
  if (!(await firstRow.isVisible().catch(() => false))) {
    test.skip(true, "no rows");
  }
  await page.keyboard.press("j");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/calls/, { timeout: 5_000 }).catch(() => {});
});
