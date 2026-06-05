import { test, expect } from "@playwright/test";

test("theme toggle persists across reload", async ({ page }) => {
  await page.goto("/");
  // Wait for client hydration so next-themes is mounted.
  await page.waitForLoadState("networkidle").catch(() => {});
  const toggle = page.getByRole("button", { name: /toggle theme/i });
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  // next-themes adds a "light" or "dark" class to <html> after hydration.
  await page.waitForFunction(
    () => /\b(light|dark)\b/.test(document.documentElement.className),
    { timeout: 10_000 },
  ).catch(() => {});
  const htmlClassBefore = (await page.locator("html").getAttribute("class")) ?? "";
  await toggle.click();
  // Wait for class to actually flip (more robust than a fixed timeout, which
  // can race with React Refresh in dev mode).
  await page.waitForFunction(
    (before) => (document.documentElement.className ?? "") !== before,
    htmlClassBefore,
    { timeout: 5_000 },
  );
  const htmlClassAfter = (await page.locator("html").getAttribute("class")) ?? "";
  expect(htmlClassAfter, "html class should change after theme toggle").not.toBe(htmlClassBefore);
  // Reload and verify persistence.
  await page.reload();
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  await page.waitForFunction(
    (expected) => (document.documentElement.className ?? "") === expected,
    htmlClassAfter,
    { timeout: 5_000 },
  ).catch(() => {});
  const htmlClassReloaded = (await page.locator("html").getAttribute("class")) ?? "";
  expect(htmlClassReloaded).toBe(htmlClassAfter);
});
