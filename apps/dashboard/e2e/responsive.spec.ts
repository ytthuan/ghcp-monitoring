import { test, expect } from "@playwright/test";

test.describe("responsive (mobile only)", () => {
  test.beforeEach((_fixtures, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-webkit", "mobile-only");
  });

  test("hamburger opens nav with all 12 links", async ({ page }) => {
    await page.goto("/");
    // Wait for full hydration before clicking — the new heavier home page
    // takes a couple of frames to wire up MobileNav's onClick in dev mode.
    await page.waitForLoadState("networkidle").catch(() => {});
    const hamburger = page.getByRole("button", { name: /open navigation/i });
    await expect(hamburger).toBeVisible();
    await hamburger.click();
    // Sheet content with brand heading appears (the desktop sidebar's brand
    // div is also in the DOM on mobile but is hidden by md:flex; we target
    // the SheetTitle heading specifically).
    await expect(
      page.getByRole("heading", { name: /copilot dashboard/i }),
    ).toBeVisible({ timeout: 10_000 });
    // All 12 nav labels are reachable inside the open sheet
    const labels = ["Totals", "Trends", "Models", "Agents", "Calls", "Sessions", "Cache", "Latency", "TTFT", "Tools", "Heatmap", "Finish reasons"];
    for (const label of labels) {
      await expect(page.getByRole("link", { name: new RegExp(`^${label}$`, "i") }).first()).toBeVisible();
    }
  });

  for (const path of ["/", "/calls", "/heatmap"]) {
    test(`no horizontal page scroll on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement || document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });
      expect(overflow, `body overflow on ${path}`).toBeLessThanOrEqual(1);
    });
  }
});
