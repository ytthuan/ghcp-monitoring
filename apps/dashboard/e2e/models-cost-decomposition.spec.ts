import { test, expect, type Page } from "@playwright/test";

/**
 * Wave 3 polish: the /models route mounts a sibling "Cost decomposition"
 * card under the leaderboard. The card shows per-model cost split into
 * input / output / cache_read / cache_create cells, sourced from the
 * server-side `estimateCostBreakdown()` already used on Home.
 *
 * No raw prompt/response/tool content should ever appear in this card —
 * it is a pure numeric surface.
 */

const SENSITIVE_SUBSTRINGS = [
  "gen_ai.input.messages",
  "gen_ai.output.messages",
  "gen_ai.tool.call.arguments",
  "gen_ai.tool.call.result",
  "tool_args",
  "tool_result",
];

async function gotoModels(page: Page): Promise<void> {
  await page.goto("/models?range=30d", { waitUntil: "domcontentloaded" });
  await page
    .locator('[data-testid="models-cost-decomposition"]')
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});
}

test.describe("/models cost decomposition card", () => {
  test("mounts the Cost decomposition card", async ({ page }) => {
    await gotoModels(page);
    const card = page.locator('[data-testid="models-cost-decomposition"]');
    await expect(card).toBeVisible();
  });

  test("renders at least one data row OR an empty state", async ({ page }) => {
    await gotoModels(page);
    const card = page.locator('[data-testid="models-cost-decomposition"]');
    await expect(card).toBeVisible();

    const dataRows = card.locator("tbody tr");
    const emptyState = card.locator(".border-dashed, [role=status]");
    const rowCount = await dataRows.count();
    const hasEmpty = (await emptyState.count()) > 0;

    if (rowCount === 0 && !hasEmpty) {
      // Some shells render the empty state without `.border-dashed`. Fall back
      // to checking for the empty-state copy used by EmptyState.
      const fallback = await card
        .getByText(/no model cost in this window/i)
        .count();
      expect(rowCount > 0 || hasEmpty || fallback > 0).toBe(true);
      return;
    }
    expect(rowCount > 0 || hasEmpty).toBe(true);
  });

  test("does not leak sensitive content (prompt/tool body) in the DOM", async ({
    page,
  }) => {
    await gotoModels(page);
    const card = page.locator('[data-testid="models-cost-decomposition"]');
    if ((await card.count()) === 0) {
      test.skip(true, "[skip] cost decomposition card not mounted");
      return;
    }
    const text = (await card.innerText()).toLowerCase();
    for (const needle of SENSITIVE_SUBSTRINGS) {
      expect(
        text.includes(needle.toLowerCase()),
        `cost decomposition card must not include "${needle}"`,
      ).toBe(false);
    }
  });
});
