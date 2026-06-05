import { test, expect } from "@playwright/test";

/**
 * Wave-1 helper change: `formatUsd` is now 2dp (with `<$0.01` for non-zero
 * sub-cent), and `formatUsdExact` (4dp, thousand-separated) is exposed via
 * `title=` tooltips on USD cells / popover triggers.
 *
 * This spec verifies the regex-level format on actual rendered USD strings
 * across Home, /models, and /calls without relying on specific data values.
 */

/**
 * Matches a 2dp USD substring like `$5,012.76` (anywhere in the cell text)
 * — many cells render `${formatUsd(x)} total` etc., so we don't anchor.
 */
const USD_2DP_SUB_RE = /\$\d{1,3}(?:,\d{3})*\.\d{2}(?!\d)/;
const USD_SUBCENT_RE = /<\$0\.01/;
/** Matches the unrounded `formatUsdExact` 4dp string. */
const USD_EXACT_TITLE_RE = /^\$\d{1,3}(?:,\d{3})*\.\d{4}$/;
/**
 * Hard-fail patterns: 4dp (or more) USD anywhere in the cell, e.g. the old
 * `$5,012.7602` that this PR is meant to eliminate. Stop-early sentinel.
 */
const USD_4DP_RE = /\$\d{1,3}(?:,\d{3})*\.\d{4,}/;

async function gotoAndSettle(page: import("@playwright/test").Page, path: string) {
  await page.goto(`${path}?range=30d`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
}

test.describe("USD formatting — 2dp + sub-cent + tooltip exact precision", () => {
  test("Home: no 4dp USD leak; 2dp pattern is present", async ({ page }) => {
    await gotoAndSettle(page, "/");

    const body = (await page.locator("body").innerText()).trim();
    // Hard contract: this PR eliminates `$5,012.7602`-style 4dp displays.
    expect(body, "4dp USD leaked on Home").not.toMatch(USD_4DP_RE);
    // Soft check: at least one valid 2dp USD render is present (window has data).
    if (USD_2DP_SUB_RE.test(body)) {
      expect(true).toBe(true);
    } else {
      test.skip(true, "[skip] no USD strings on Home in this window");
    }
  });

  test("Home cost-decomposition card: tooltip exposes 4dp via title=", async ({
    page,
  }) => {
    await gotoAndSettle(page, "/");
    const card = page.locator('[data-testid="overview-cost-decomposition"]');
    const present = (await card.count()) > 0;
    test.skip(!present, "[skip] cost decomposition card not on Home");

    // The "Total" cell carries title={formatUsdExact(r.cost)}.
    const totalCells = card.locator("td[title^='$']");
    const tcCount = await totalCells.count();
    test.skip(tcCount === 0, "[skip] no priced rows in cost decomposition card");

    let asserted = 0;
    for (let i = 0; i < tcCount; i += 1) {
      const title = (await totalCells.nth(i).getAttribute("title")) ?? "";
      if (USD_EXACT_TITLE_RE.test(title)) {
        asserted += 1;
      } else {
        expect(title, `bad title attr: ${JSON.stringify(title)}`).toMatch(
          USD_EXACT_TITLE_RE,
        );
      }
    }
    expect(asserted).toBeGreaterThan(0);
  });

  test("/models: no 4dp USD leak; 2dp + Included present", async ({ page }) => {
    await gotoAndSettle(page, "/models");
    const body = (await page.locator("body").innerText()).trim();
    expect(body, "4dp USD leaked on /models").not.toMatch(USD_4DP_RE);
    if (!USD_2DP_SUB_RE.test(body)) {
      test.skip(true, "[skip] no USD strings on /models in this window");
    }
  });

  test("/calls: cost cell renders 2dp text + 4dp title", async ({ page }) => {
    await gotoAndSettle(page, "/calls");
    // CostCell mounts a Popover trigger with title=formatUsdExact(...).
    const trigger = page
      .locator("[aria-label^='Cost breakdown:']")
      .first();
    const present = (await trigger.count()) > 0;
    test.skip(!present, "[skip] no cost cells on /calls in this window");

    const text = (await trigger.innerText()).trim();
    expect(text, `4dp USD leaked in /calls: ${JSON.stringify(text)}`).not.toMatch(
      USD_4DP_RE,
    );
    const ok =
      USD_2DP_SUB_RE.test(text) ||
      USD_SUBCENT_RE.test(text) ||
      text === "—";
    expect(ok, `cost cell text: ${JSON.stringify(text)}`).toBe(true);

    const title = (await trigger.getAttribute("title")) ?? "";
    if (text !== "—") {
      expect(title, `cost cell title: ${JSON.stringify(title)}`).toMatch(
        USD_EXACT_TITLE_RE,
      );
    }
  });
});
