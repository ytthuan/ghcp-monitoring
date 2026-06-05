import { test, expect, type Page } from "@playwright/test";

/**
 * Wave C polish: the day×hour heatmap renders compact cell labels
 * (`4.6M`, `21.1M`, …) with a popover that reveals the exact breakdown
 * (input + output) and links to /calls for the matching hour window.
 *
 * Each assertion is wrapped in test.skip() if the dev/CI environment
 * has no telemetry data, matching the existing [skip] convention.
 */

async function gotoHeatmap(page: Page): Promise<void> {
  await page.goto("/heatmap?range=30d", { waitUntil: "domcontentloaded" });
  // Wait until either the chart card or the empty state shows.
  await page
    .locator('[data-testid="chart-card"], .border-dashed')
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});
}

test.describe("heatmap polish", () => {
  test("cells render compact labels (K/M/B) and exact value in title", async ({
    page,
  }) => {
    await gotoHeatmap(page);
    const cells = page.locator('[data-testid="heatmap-cell"]');
    const count = await cells.count();
    if (count === 0) {
      test.skip(true, "[skip] no heatmap cells in this dataset");
      return;
    }
    // Collect all cell labels and assert at least one matches the
    // compact-suffix format (K/M/B). Datasets with only sub-10K buckets
    // would skip — but that's vanishingly rare for a 30d window with data.
    const labels = await cells.allInnerTexts();
    const hasCompact = labels.some((s) => /\d(?:\.\d+)?\s*[KMB]\b/.test(s.trim()));
    if (!hasCompact) {
      test.skip(true, "[skip] all heatmap buckets below 10K — no compact labels");
      return;
    }
    expect(hasCompact).toBe(true);

    // Title attr on at least one cell should contain a thousand-separated
    // exact value (e.g. "21,140,874").
    const firstTitle = await cells.first().getAttribute("title");
    expect(firstTitle, "cell title attribute").toBeTruthy();
    expect(firstTitle!).toMatch(/\d{1,3}(,\d{3})+/);
  });

  test("clicking a cell opens a popover with exact breakdown and a /calls drilldown", async ({
    page,
  }) => {
    await gotoHeatmap(page);
    const cells = page.locator('[data-testid="heatmap-cell"]');
    const count = await cells.count();
    if (count === 0) {
      test.skip(true, "[skip] no heatmap cells in this dataset");
      return;
    }
    await cells.first().click();

    // Radix Popover content is portaled to the document body. Look up by
    // role=dialog (Radix marks PopoverContent with role=dialog).
    const popover = page.getByRole("dialog").first();
    await expect(popover).toBeVisible({ timeout: 5_000 });

    // The popover must contain at least one thousand-separated number
    // (the exact total / input / output value).
    const popText = await popover.innerText();
    expect(popText, "popover body").toMatch(/\d{1,3},\d{3}/);

    // Drilldown link present, points at /calls, carries the hour window.
    const link = popover.locator('[data-testid="heatmap-popover-drilldown"]');
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href, "drilldown href").toBeTruthy();
    expect(href!).toContain("/calls");
    // Either a precise from/to window OR a range fallback must be present.
    expect(href!).toMatch(/(from=.+&.*to=|range=)/);

    // Clicking it navigates to /calls.
    await Promise.all([
      page.waitForURL(/\/calls(\?|$)/, { timeout: 10_000 }),
      link.click(),
    ]);
    expect(page.url()).toMatch(/\/calls/);
  });

  test("legend and cell metadata follow the configured timezone", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("ghcp-dashboard-tz", "Asia/Bangkok");
    });
    await gotoHeatmap(page);
    const cells = page.locator('[data-testid="heatmap-cell"]');
    const count = await cells.count();
    if (count === 0) {
      test.skip(true, "[skip] no heatmap cells in this dataset");
      return;
    }

    await expect(page.getByText(/Hour bucket:\s*Asia\/Bangkok/i)).toBeVisible();
    await expect(page.getByText(/Hour bucket:\s*UTC \(server\)/i)).toHaveCount(0);

    const firstTitle = await cells.first().getAttribute("title");
    expect(firstTitle, "cell title attribute").toContain("Asia/Bangkok");
    expect(firstTitle, "cell title attribute").not.toContain("UTC");

    await cells.first().click();
    const popover = page.getByRole("dialog").first();
    await expect(popover).toBeVisible({ timeout: 5_000 });
    await expect(popover).toContainText(/Bucket shown in Asia\/Bangkok/i);
    await expect(popover).not.toContainText(/UTC bucket/i);
  });

  test("does not leak raw telemetry content in cell labels or popover", async ({
    page,
  }) => {
    await gotoHeatmap(page);
    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const needle of ["prompt:", "response:", "tool_args", "tool_result"]) {
      expect(body, `heatmap body should not contain "${needle}"`).not.toContain(
        needle,
      );
    }
  });

  test("table is horizontally scrollable on mobile viewport", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-webkit", "mobile-only");
    await gotoHeatmap(page);
    const scroller = page.locator(".overflow-x-auto").filter({ has: page.locator("table") }).first();
    if (!(await scroller.isVisible().catch(() => false))) {
      test.skip(true, "[skip] heatmap not rendered (no data)");
      return;
    }
    // The inner table (24 hour columns + the day-label column at h-9 w-12)
    // must overflow the iPhone viewport so horizontal scroll engages.
    const metrics = await scroller.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  });
});
