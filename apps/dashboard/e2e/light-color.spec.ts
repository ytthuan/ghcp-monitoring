import { test, expect } from "@playwright/test";

// Smoke test for the warm cream light theme (Layer 1 / Layer 5 of the
// dashboard color refresh). Verifies that:
//   1. The page background resolves to the warm cream HSL(37 29% 95%).
//   2. Cards stay crisp white so they continue to pop against the cream.
//
// HSL(37 29% 95%) -> rgb(246, 243, 239) per the CSS Color Module spec
// (browsers round component-wise after the standard HSL->RGB conversion).
test("light theme paints warm cream background and white cards", async ({ page }) => {
  await page.goto("/");

  // Force the light theme via next-themes' default localStorage key.
  await page.evaluate(() => {
    window.localStorage.setItem("theme", "light");
  });
  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => {});

  // Wait until next-themes has applied the "light" class on <html>.
  await page.waitForFunction(
    () => document.documentElement.classList.contains("light"),
    { timeout: 10_000 },
  );

  const bodyBg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  // eslint-disable-next-line no-console
  console.log("body.backgroundColor =", bodyBg);
  expect(bodyBg).toBe("rgb(246, 243, 239)");

  // Cards should remain white. Prefer the data-slot used by shadcn/ui's Card,
  // fall back to .bg-card if a route doesn't render a slotted card. Filter to
  // visible elements so the hidden desktop sidebar (`<aside class="hidden ...">`)
  // doesn't get picked on mobile viewports.
  const card = page
    .locator('[data-slot="card"], .bg-card')
    .filter({ visible: true })
    .first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  const cardBg = await card.evaluate(
    (el) => getComputedStyle(el as HTMLElement).backgroundColor,
  );
  // eslint-disable-next-line no-console
  console.log("card.backgroundColor =", cardBg);
  expect(cardBg).toBe("rgb(255, 255, 255)");
});
