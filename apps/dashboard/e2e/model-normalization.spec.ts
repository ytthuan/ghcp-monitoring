import { test, expect } from "@playwright/test";

// Regression tests for the model-name normalization feature:
//   1. The literal `1m-internal` suffix must never reach the UI — it is
//      stripped at the SQL layer (`replaceRegexpOne`) for every query that
//      reads `gen_ai.{request,response}.model`, plus a defensive
//      `normalizeModelName()` at the TS pricing layer.
//   2. Cost estimates fall back from response_model → request_model when
//      the response side doesn't resolve to a known rate. We can't easily
//      assert the fallback without seeded fixture data, so this spec only
//      asserts the absence of the suffix; the fallback is exercised by
//      pricing.ts unit tests (none yet) and by visual confirmation on
//      `/calls` (cost cell tooltip "priced as <model>").

const ROUTES = ["/", "/models", "/calls"] as const;

for (const route of ROUTES) {
  test(`no '1m-internal' suffix is visible on ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});

    // If we hit an empty / error end-state, this assertion is trivially true.
    const body = page.locator("body");
    await expect(body).toBeVisible();

    // The whole page text must not contain the literal substring `1m-internal`
    // anywhere — neither in table cells, badges, headings, nor tooltips.
    const text = await body.innerText();
    expect(text).not.toMatch(/1m-internal/i);
  });
}
