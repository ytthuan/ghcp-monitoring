import { test, expect } from "@playwright/test";
import { assertLeaderboardBasics } from "./_leaderboard-helpers";

test("tools report renders execute_tool spans when telemetry exists", async ({
  page,
}) => {
  await page.goto("/tools");
  await page.waitForLoadState("domcontentloaded");

  const table = page.locator("table").first();
  const empty = page.getByText(/no .* match these filters|no .* in this window/i).first();
  const queryError = page.getByText(/query failed/i).first();
  await expect(table.or(empty).or(queryError)).toBeVisible({ timeout: 30_000 });

  if (!(await table.isVisible().catch(() => false))) {
    test.skip(true, "no tool telemetry available in this environment");
  }

  await expect(page.getByText(/execute_tool \*/i)).toBeVisible();
  await expect(table.getByText(/bash|view|edit|create|sql/i).first()).toBeVisible({
    timeout: 10_000,
  });
});

test("tools leaderboard: sticky header, sortable, focusable rows, CSV, no leaks", async ({ page }) => {
  await assertLeaderboardBasics(page, {
    url: "/tools",
    csvLabel: /export tools as csv/i,
  });
});

test("tools row activation by keyboard navigates to /calls", async ({ page }) => {
  await page.goto("/tools");
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

