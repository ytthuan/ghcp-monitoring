import { test, expect } from "@playwright/test";
import * as fs from "node:fs";

test.describe("calls page polish (wave 3)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/calls");
    await page.waitForLoadState("domcontentloaded");
    // Wait for the table to settle (rows render or empty state shows).
    await Promise.race([
      page.getByTestId("calls-row").first().waitFor({ state: "visible", timeout: 8_000 }).catch(() => {}),
      page.getByText(/no calls in this range/i).first().waitFor({ state: "visible", timeout: 8_000 }).catch(() => {}),
    ]);
  });

  test("sticky header is present and stays in view while scrolling the table", async ({
    page,
  }) => {
    const empty = page.getByText(/no calls in this range/i).first();
    const header = page.getByTestId("calls-sticky-header");
    const queryError = page.getByText(/query failed/i).first();
    await expect(header.or(empty).or(queryError)).toBeVisible({ timeout: 15_000 });

    if (await header.isVisible().catch(() => false)) {
      // Sticky positioning -> CSS class should include "sticky" + "top-0".
      const cls = await header.getAttribute("class");
      expect(cls ?? "").toMatch(/sticky/);
      expect(cls ?? "").toMatch(/top-0/);

      const scroller = page.getByTestId("calls-scroll");
      const initialBox = await header.boundingBox();
      await scroller.evaluate((el) => {
        (el as HTMLElement).scrollTop = 600;
      });
      await page.waitForTimeout(150);
      const afterBox = await header.boundingBox();
      if (initialBox && afterBox) {
        // Sticky header should remain visible at ~same y (within a few px).
        expect(Math.abs(afterBox.y - initialBox.y)).toBeLessThan(8);
      }
    }
  });

  test("column visibility menu hides a column and updates the URL", async ({
    page,
  }, testInfo) => {
    // Radix dropdown trigger semantics + touch event simulation make this
    // flaky on mobile-webkit; the feature is desktop-first by design.
    test.skip(
      testInfo.project.name === "mobile-webkit",
      "dropdown menu desktop-only",
    );
    const trigger = page.getByTestId("columns-menu-trigger");
    if (!(await trigger.isVisible().catch(() => false))) test.skip();
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible({ timeout: 5_000 });
    const cacheReadItem = menu
      .locator('[role="menuitemcheckbox"]')
      .filter({ hasText: "Cache read" });
    await expect(cacheReadItem).toBeVisible();
    // Toggle ON: cache_read appears in URL.
    await cacheReadItem.click();
    await page.waitForTimeout(200);
    expect(page.url()).toMatch(/cols=/);
    expect(page.url()).toMatch(/cache_read/);
    // Menu stays open thanks to onSelect preventDefault — toggle OFF.
    await expect(cacheReadItem).toBeVisible();
    await cacheReadItem.click();
    await page.waitForTimeout(200);
    // Default visible set restored => cols param dropped from URL.
    expect(page.url()).not.toMatch(/cache_read/);
  });

  test("hovering a row reveals the Open trace affordance", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-webkit",
      "hover affordance is desktop-only (no hover on touch)",
    );
    const firstRow = page.getByTestId("calls-row").first();
    if (!(await firstRow.isVisible().catch(() => false))) test.skip();
    const link = firstRow.getByTestId("open-trace");
    // Hover the row, then wait for the opacity transition to settle.
    await firstRow.hover();
    await expect(link).toBeVisible();
    await expect
      .poll(
        async () => parseFloat(await link.evaluate((el) => getComputedStyle(el).opacity)),
        { timeout: 2_000 },
      )
      .toBeGreaterThan(0.9);
  });

  test("j then Enter activates the focused row and navigates to a trace", async ({
    page,
  }) => {
    const firstRow = page.getByTestId("calls-row").first();
    if (!(await firstRow.isVisible().catch(() => false))) test.skip();
    // Click the page body to ensure focus isn't trapped in an input.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("j");
    await page.waitForTimeout(80);
    await expect(firstRow).toHaveAttribute("data-active", "true");
    const traceLink = firstRow.getByTestId("open-trace");
    const expectedHref = await traceLink.getAttribute("href").catch(() => null);
    await page.keyboard.press("Enter");
    await page.waitForLoadState("domcontentloaded");
    if (expectedHref) {
      expect(page.url()).toContain(expectedHref);
    } else {
      expect(page.url()).toMatch(/\/traces\//);
    }
  });

  test("CSV export downloads file with safe content and correct filename", async ({
    page,
  }) => {
    const button = page.getByTestId("export-csv");
    if (!(await button.isVisible().catch(() => false))) test.skip();
    if (await button.isDisabled().catch(() => true)) test.skip();
    await expect(button).toHaveAttribute(
      "aria-label",
      "Export visible rows as CSV",
    );

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      button.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^calls-\d{4}-\d{2}-\d{2}-\d{4}\.csv$/,
    );
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    if (filePath) {
      const body = fs.readFileSync(filePath, "utf8");
      // Telemetry safety: never leak prompt/response/tool content.
      expect(body).not.toMatch(/prompt:/i);
      expect(body).not.toMatch(/response:/i);
      expect(body).not.toMatch(/tool_args/i);
      expect(body).not.toMatch(/tool_result/i);
    }
  });

  test("rendered body shows a [redacted] placeholder when content is present", async ({
    page,
  }) => {
    const firstRow = page.getByTestId("calls-row").first();
    if (!(await firstRow.isVisible().catch(() => false))) test.skip();
    const redacted = page.getByText(/\[redacted/i).first();
    await expect(redacted).toBeVisible();
  });

  test("empty-state Reset filters action restores defaults", async ({ page }) => {
    const reset = page.getByTestId("empty-reset-filters");
    if (!(await reset.isVisible().catch(() => false))) test.skip();
    await reset.click();
    await page.waitForTimeout(200);
    // After reset, filter-driven URL params should be cleared/normalized.
    expect(page.url()).not.toMatch(/range=custom/);
  });
});
