import { test, expect } from "@playwright/test";

/**
 * Wave-1+2 disclosure: `copilot-nes-oct` (and any future
 * `copilot-(nes|inline|complete|edit)-*`) is recognised as a Copilot
 * internal model — `rateFor()` returns a zero rate (not null) and the UI
 * renders an `<InternalModelBadge>` (Included pill + Tooltip) next to the
 * model name. This spec asserts the badge is present and the model is no
 * longer counted toward "unknown priced models".
 */

async function nesPresent(page: import("@playwright/test").Page): Promise<boolean> {
  // Cheap probe: render /models, wait for the cost-decomposition card body
  // to populate (it's client-fetched via TanStack Query, so SSR HTML is empty),
  // then check for any copilot-nes-* token in the body.
  await page.goto("/models?range=30d", { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-testid="models-cost-decomposition"]');
  await card.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  // Give react-query a beat to fetch + render rows.
  await page.waitForTimeout(2500);
  const cell = page.locator("text=/copilot-nes-/").first();
  return (await cell.count()) > 0;
}

test.describe("Internal model disclosure — copilot-nes-*", () => {
  test("Home cost decomposition shows 'Included' pill for NES rows", async ({
    page,
  }) => {
    const present = await nesPresent(page);
    test.skip(!present, "[skip] no copilot-nes-* telemetry in window");

    await page.goto("/?range=30d", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    const card = page.locator('[data-testid="overview-cost-decomposition"]');
    if ((await card.count()) === 0) {
      test.skip(true, "[skip] cost decomposition card not on Home");
      return;
    }
    const badge = card.locator('[data-testid="internal-model-badge"]').first();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAccessibleName(/Copilot-internal model/i);
  });

  test("/models breakdown card mounts the InternalModelBadge for NES rows", async ({
    page,
  }) => {
    const present = await nesPresent(page);
    test.skip(!present, "[skip] no copilot-nes-* telemetry in window");

    const card = page.locator('[data-testid="models-cost-decomposition"]');
    if ((await card.count()) === 0) {
      test.skip(true, "[skip] decomposition card not on /models");
      return;
    }
    const badge = card.locator('[data-testid="internal-model-badge"]').first();
    await expect(badge).toBeVisible();
  });

  test("Home footer no longer counts copilot-nes-* as unknown", async ({
    page,
  }) => {
    const present = await nesPresent(page);
    test.skip(!present, "[skip] no copilot-nes-* telemetry in window");

    await page.goto("/?range=30d", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    // The footer renders "(N unknown model[s])" only when N > 0. If the
    // body never includes "copilot-nes" in any "unknown" annotation, we're
    // good. Easy approximation: assert the body does NOT contain a
    // string like "copilot-nes-oct (unknown".
    const body = await page.textContent("body");
    expect(body, "body innerText").not.toMatch(/copilot-nes[^\n]*unknown/i);
  });

  test("badge tooltip body mentions Next Edit Suggestions / Copilot subscription", async ({
    page,
  }) => {
    const present = await nesPresent(page);
    test.skip(!present, "[skip] no copilot-nes-* telemetry in window");

    await page.goto("/models?range=30d", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    const card = page.locator('[data-testid="models-cost-decomposition"]');
    if ((await card.count()) === 0) {
      test.skip(true, "[skip] decomposition card not on /models");
      return;
    }
    const badge = card.locator('[data-testid="internal-model-badge"]').first();
    await expect(badge).toBeVisible();
    // Aria-label is the disclosure description (set in InternalModelBadge).
    const label = (await badge.getAttribute("aria-label")) ?? "";
    expect(label).toMatch(/Copilot-internal model:/);
    expect(label).toMatch(/Next Edit Suggestions|inline|completion|edit-prediction|subscription/i);
  });
});
