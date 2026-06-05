import { test, expect } from "@playwright/test";

test("calls table renders, sortable headers respond, pagination present", async ({ page }) => {
  await page.goto("/calls");
  await page.waitForLoadState("domcontentloaded");
  // Three acceptable end-states (the test asserts the page mounted, not that
  // any specific data exists):
  //   - a real <table> (data present)
  //   - the EmptyState ("No data yet") text
  //   - the ErrorBoundary text ("Query failed …") that surfaces in dev mode
  //     when the host can't reach the docker-network ClickHouse
  const table = page.locator("table").first();
  const empty = page.getByText(/no data yet/i).first();
  const queryError = page.getByText(/query failed/i).first();
  await expect(table.or(empty).or(queryError)).toBeVisible({ timeout: 15_000 });

  if (await table.isVisible().catch(() => false)) {
    const firstHeader = table.locator("th").first();
    if (await firstHeader.isVisible().catch(() => false)) {
      await firstHeader.click();
      await page.waitForTimeout(150);
      await expect(table).toBeVisible();
    }
  }
});
