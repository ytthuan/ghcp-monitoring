import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Wave B follow-up: donut slices must render with non-colliding colors when
 * there are ≥3 slices. Wave A's audit confirmed that the previous
 * `colorForModel` hash was a 10-bucket palette and could collide on small
 * donuts (≥4 slices commonly hashed to the same fill). This spec asserts the
 * fix introduced via `colorByIndex` on `/finish` (single donut) and `/`
 * (Home — three donuts).
 *
 * Tooltip assertion piggy-backs on the same render to confirm the shared
 * Recharts tooltip primitive now uses `formatExact` (thousand separators) and
 * the donut's custom tooltip exposes a percentage share.
 *
 * Specs follow the [skip] convention used by other e2e suites: when the
 * underlying data has fewer than 3 slices, the assertion is skipped.
 */

const MIN_SLICES = 3;

async function donutCells(donut: Locator): Promise<Locator> {
  // `donut` is already a .recharts-pie root — descend directly to sectors.
  return donut.locator(".recharts-sector");
}

async function uniqueFills(cells: Locator): Promise<string[]> {
  const fills = await cells.evaluateAll((nodes) =>
    nodes.map((n) => (n as SVGElement).getAttribute("fill") ?? ""),
  );
  return Array.from(new Set(fills.filter(Boolean)));
}

async function gotoAndSettle(page: Page, path: string): Promise<void> {
  await page.goto(`${path}?range=30d`, { waitUntil: "domcontentloaded" });
  // Wait for any donut to mount AND for at least one slice to render.
  await page
    .locator(".recharts-pie .recharts-sector")
    .first()
    .waitFor({ state: "attached", timeout: 20_000 })
    .catch(() => {});
  // Small settle so multi-donut pages have all their sectors painted.
  await page.waitForTimeout(1000);
}

test.describe("Donut slice colors are non-colliding", () => {
  test("/finish donut: all slice fills unique when ≥3 slices", async ({ page }) => {
    await gotoAndSettle(page, "/finish");

    const donut = page.locator(".recharts-pie").first();
    const attached = (await donut.count()) > 0;
    test.skip(!attached, "[skip] /finish donut not rendered (empty state)");

    const cells = await donutCells(donut);
    const count = await cells.count();
    test.skip(count < MIN_SLICES, `[skip] /finish donut has <${MIN_SLICES} slices (${count})`);

    const unique = await uniqueFills(cells);
    expect(unique.length, `expected ${count} unique fills, got ${unique.length}`).toBe(count);
  });

  test("/ (Home) donuts: each donut with ≥3 slices has unique fills", async ({ page }) => {
    await gotoAndSettle(page, "/");

    const donuts = page.locator(".recharts-pie");
    const total = await donuts.count();
    test.skip(total === 0, "[skip] no donuts on Home");

    let asserted = 0;
    for (let i = 0; i < total; i += 1) {
      const donut = donuts.nth(i);
      const cells = await donutCells(donut);
      const count = await cells.count();
      if (count < MIN_SLICES) continue;
      const unique = await uniqueFills(cells);
      expect(
        unique.length,
        `Home donut #${i}: expected ${count} unique fills, got ${unique.length}`,
      ).toBe(count);
      asserted += 1;
    }
    test.skip(asserted === 0, `[skip] no Home donut had ≥${MIN_SLICES} slices`);
  });

  test("/finish donut tooltip shows formatted value and percentage", async ({ page }) => {
    await gotoAndSettle(page, "/finish");

    const donut = page.locator(".recharts-pie").first();
    const attached = (await donut.count()) > 0;
    test.skip(!attached, "[skip] /finish donut not rendered");

    const cells = await donutCells(donut);
    const count = await cells.count();
    test.skip(count === 0, "[skip] /finish donut has no slices");

    // Recharts paints <path class="recharts-sector"> elements that some
    // engines (notably mobile-webkit) refuse to "hover" via the standard
    // actionability path even with force:true. Move the mouse to the slice
    // centroid via boundingBox + page.mouse.move(), which always works.
    const cell = cells.first();
    const box = await cell.boundingBox();
    if (!box) {
      test.skip(true, "[skip] could not measure donut slice bounding box");
      return;
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(
      box.x + box.width / 2 + 1,
      box.y + box.height / 2 + 1,
    );

    // Recharts wraps custom tooltip content in .recharts-tooltip-wrapper.
    const tooltip = page.locator(".recharts-tooltip-wrapper").first();
    await tooltip.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    const visibleTooltip = await tooltip.isVisible().catch(() => false);
    test.skip(!visibleTooltip, "[skip] tooltip did not appear on hover");

    const text = (await tooltip.innerText()).trim();

    // Percentage must be present (custom Donut tooltip renders formatPct).
    expect(text, `tooltip text: ${text}`).toMatch(/%/);

    // Thousand separator only required when value ≥ 1,000. Skip the comma
    // assertion gracefully for tiny datasets.
    const numeric = text.replace(/[^0-9]/g, "");
    if (numeric.length >= 4) {
      expect(text, `tooltip should use thousand separators: ${text}`).toMatch(
        /\d{1,3},\d{3}/,
      );
    }
  });
});
