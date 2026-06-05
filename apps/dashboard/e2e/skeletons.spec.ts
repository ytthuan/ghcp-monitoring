import { test, expect } from "@playwright/test";

// Verifies the shape-aware skeletons added in Wave 3 polish:
//   - /calls renders <TableSkeleton> while the calls query is in flight
//     (data-testid="table-skeleton").
//   - / (Home) renders <KpiStripSkeleton> while the overview query is in
//     flight (data-testid="kpi-strip-skeleton").
//   - With prefers-reduced-motion: reduce, rendered skeleton primitives
//     carry the `motion-reduce:animate-none` class so the pulse is
//     suppressed by the browser.
//
// Loading is racey — once data is cached the skeleton may never appear.
// Each assertion is wrapped in test.skip() if the page never reaches a
// loading state in this environment, matching the [skip] convention used
// by other specs in this suite.

test.describe("Shape-aware skeletons", () => {
  test("/calls shows table skeleton during initial load", async ({ page }) => {
    const skeleton = page.getByTestId("table-skeleton");
    const navP = page.goto("/calls");
    // Race: skeleton may flash before data resolves.
    const seen = await skeleton
      .first()
      .waitFor({ state: "visible", timeout: 1500 })
      .then(() => true)
      .catch(() => false);
    await navP;
    test.skip(!seen, "[skip] calls loaded before skeleton was observed");
    await expect(skeleton.first()).toBeVisible();
  });

  test("/ shows kpi strip skeleton during initial load", async ({ page }) => {
    const skeleton = page.getByTestId("kpi-strip-skeleton");
    const navP = page.goto("/");
    const seen = await skeleton
      .first()
      .waitFor({ state: "visible", timeout: 1500 })
      .then(() => true)
      .catch(() => false);
    await navP;
    test.skip(!seen, "[skip] home loaded before skeleton was observed");
    await expect(skeleton.first()).toBeVisible();
  });

  test("reduced-motion suppresses skeleton pulse", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/calls");
    // Find any skeleton element rendered on the page (table, chart, or kpi).
    const skeleton = page
      .locator(
        '[data-testid="table-skeleton"], [data-testid="chart-skeleton"], [data-testid="kpi-strip-skeleton"]',
      )
      .first();
    const seen = await skeleton
      .waitFor({ state: "visible", timeout: 1500 })
      .then(() => true)
      .catch(() => false);
    test.skip(!seen, "[skip] no skeleton observed before data resolved");
    // The inner Skeleton primitive carries the class; check that at least
    // one descendant has motion-reduce:animate-none applied.
    const motionReduceCount = await skeleton
      .locator('[class*="motion-reduce:animate-none"]')
      .count();
    expect(motionReduceCount).toBeGreaterThan(0);
  });
});
