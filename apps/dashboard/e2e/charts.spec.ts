import { test, expect, type Page } from "@playwright/test";

/**
 * Wave 3 polish-charts: each of the six chart-only routes must render the
 * standardized chart card pattern with:
 *   - a Card title and an eyebrow stat element
 *   - a (?) "what this measures" tooltip trigger that is keyboard-focusable
 *   - a drill-down link to /calls (or /traces for heatmap) that preserves the
 *     `range` URL search param when set
 *   - no raw telemetry content leaks (prompt:/response:/tool_args/tool_result)
 */
const PAGES: Array<{
  path: string;
  drill: "/calls" | "/traces";
}> = [
  { path: "/trends", drill: "/calls" },
  { path: "/heatmap", drill: "/traces" },
  { path: "/ttft", drill: "/calls" },
  { path: "/latency", drill: "/calls" },
  { path: "/cache", drill: "/calls" },
  { path: "/finish", drill: "/calls" },
];

const FORBIDDEN_SUBSTRINGS = ["prompt:", "response:", "tool_args", "tool_result"];

async function gotoWithRange(page: Page, path: string): Promise<void> {
  // Force a known time range so the drilldown has something to preserve and
  // the page has the widest chance of returning data.
  await page.goto(`${path}?range=30d`, { waitUntil: "domcontentloaded" });
  // Give the chart card a chance to render past the loading skeleton.
  await page
    .locator('[data-testid="chart-card"], .border-dashed')
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});
}

for (const { path, drill } of PAGES) {
  test.describe(`chart page ${path}`, () => {
    test("renders chart card with title, eyebrow stat, help tooltip, and drilldown", async ({
      page,
    }) => {
      await gotoWithRange(page, path);

      // If empty state rendered, the rest is N/A — assert the empty card exists
      // with descriptive copy and bail out cleanly.
      const empty = page.locator(".border-dashed").first();
      const card = page.locator('[data-testid="chart-card"]').first();
      const isEmpty =
        (await empty.isVisible().catch(() => false)) &&
        !(await card.isVisible().catch(() => false));

      if (isEmpty) {
        await expect(empty).toContainText(/range|filters|samples|activity|finish/i);
        return;
      }

      // Card and title
      await expect(card).toBeVisible();
      const title = card.locator('[data-slot="card-title"], .text-foreground').first();
      await expect(title).toBeVisible();

      // Eyebrow stat — the big number / label below the title
      await expect(card.locator('[data-testid="chart-eyebrow-stat"]')).toBeVisible();

      // (?) tooltip trigger — exists, has accessible name, is focusable
      const help = card.locator('[data-testid="chart-help"]').first();
      await expect(help).toBeVisible();
      await expect(help).toHaveAttribute("aria-label", /what this measures/i);
      await help.focus();
      await expect(help).toBeFocused();

      // Drilldown link present and pointing at the right route. Using a
      // function in TanStack Router's `search` prop ultimately resolves to a
      // full href — assert the path and that range survives.
      const drillLink = card.locator('[data-testid="chart-drilldown"]').first();
      await expect(drillLink).toBeVisible();
      const href = await drillLink.getAttribute("href");
      expect(href, "drilldown href").toBeTruthy();
      expect(href!).toContain(drill);
      expect(href!).toMatch(/range=30d/);
    });

    test("does not leak raw telemetry content", async ({ page }) => {
      await gotoWithRange(page, path);
      const body = (await page.locator("body").innerText()).toLowerCase();
      for (const needle of FORBIDDEN_SUBSTRINGS) {
        expect(body, `${path} body should not contain "${needle}"`).not.toContain(
          needle.toLowerCase(),
        );
      }
    });
  });
}
