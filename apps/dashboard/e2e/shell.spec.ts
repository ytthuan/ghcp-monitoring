import { test, expect } from "@playwright/test";

/**
 * Wave 2 shell-polish regression suite.
 *
 * Covers:
 *  - ⌘K / Ctrl+K opens the command palette; Esc closes it.
 *  - Sidebar collapse toggle works and persists across reload (desktop).
 *  - Range presets in the FilterBar update the URL and trigger label.
 *  - Active-filter chips appear and clear individual filters.
 *  - CommandPalette MUST NOT contain raw prompt/response/tool content
 *    (Wave 4 telemetry-safety regression guard).
 */

test.describe("shell — command palette", () => {
  test("⌘K opens, Esc closes", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Use Meta+K (works on macOS-style mods); for non-mac we fall back to Control+K.
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+KeyK" : "Control+KeyK");

    const palette = page.getByTestId("command-palette");
    await expect(palette).toBeVisible({ timeout: 5_000 });

    // Telemetry-safety regression: the palette must not surface any raw
    // prompt/response/tool content. There is no [redacted] placeholder
    // either — the palette doesn't even attempt to render telemetry.
    const body = (await palette.innerText()).toLowerCase();
    expect(body).not.toContain("[redacted]");
    expect(body).not.toMatch(/prompt:/);
    expect(body).not.toMatch(/response:/);
    expect(body).not.toMatch(/tool[_ -]args/);
    expect(body).not.toMatch(/tool[_ -]result/);

    // Sanity: the navigation actions ARE present.
    expect(body).toContain("go to totals");
    expect(body).toContain("go to traces");

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden({ timeout: 5_000 });
  });
});

test.describe("shell — sidebar collapse persistence", () => {
  test.beforeEach((_fixtures, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "sidebar is desktop-only",
    );
  });

  test("collapse toggle persists across reload", async ({ page, context }) => {
    await context.clearCookies();
    // Clear localStorage on the first navigation only — using addInitScript
    // would re-run on reload and wipe the persisted collapse state.
    await page.goto("/");
    await page.evaluate(() => {
      try {
        localStorage.removeItem("dashboard:sidebar:collapsed");
      } catch {
        /* ignore */
      }
    });
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});

    const aside = page.locator("aside[data-collapsed]");
    await expect(aside).toBeVisible();
    await expect(aside).toHaveAttribute("data-collapsed", "false");

    await page.getByTestId("sidebar-toggle").click();
    await expect(aside).toHaveAttribute("data-collapsed", "true");

    // Persisted in localStorage under the documented key.
    const stored = await page.evaluate(() =>
      localStorage.getItem("dashboard:sidebar:collapsed"),
    );
    expect(stored).toBe("1");

    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});
    const asideAfter = page.locator("aside[data-collapsed]");
    await expect(asideAfter).toHaveAttribute("data-collapsed", "true");
  });
});

test.describe("shell — FilterBar range preset", () => {
  test("clicking Last 7d preset updates the URL and the trigger", async ({
    page,
  }) => {
    await page.goto("/?range=24h");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Trigger currently shows Last 24h.
    const trigger = page.getByTestId("range-trigger");
    await expect(trigger).toHaveAttribute("aria-label", /Last 24h/);

    await trigger.click();
    const popover = page.getByTestId("range-popover");
    await expect(popover).toBeVisible();
    await page.getByTestId("range-preset-7d").click();

    // URL reflects the new range.
    await expect(page).toHaveURL(/[?&]range=7d/);
    await expect(trigger).toHaveAttribute("aria-label", /Last 7d/);
  });
});

test.describe("shell — custom range timezone", () => {
  test.use({ timezoneId: "Asia/Bangkok" });

  test("stores custom datetime-local values as UTC instants from local time", async ({
    page,
  }) => {
    await page.goto("/?range=7d");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByLabel("Select timezone")).toContainText(
      "Local (Asia/Bangkok)",
      { timeout: 10_000 },
    );

    const trigger = page.getByTestId("range-trigger");
    await trigger.click();
    await page.getByTestId("range-preset-custom").click();

    await page.getByLabel("Custom range start").fill("2026-05-18T16:45");
    await page.getByLabel("Custom range end").fill("2026-05-18T16:55");

    await expect
      .poll(() => new URL(page.url()).searchParams.get("from"))
      .toBe("2026-05-18T09:45:00Z");
    expect(new URL(page.url()).searchParams.get("to")).toBe(
      "2026-05-18T09:55:00Z",
    );
    await expect(trigger).toHaveAttribute(
      "aria-label",
      /Custom: 2026-05-18T16:45 → 2026-05-18T16:55/,
    );
  });
});

test.describe("shell — filter chips", () => {
  test("model chip appears and clears", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});

    const modelInput = page.getByLabel("model filter", { exact: true });
    await modelInput.fill("gpt-4o");
    // Debounce is 250 ms.
    const chip = page.getByTestId("filter-chip-model-gpt-4o");
    await expect(chip).toBeVisible({ timeout: 5_000 });
    await expect(chip).toContainText("model: gpt-4o");

    await chip.getByRole("button", { name: /Clear/i }).click();
    await expect(chip).toBeHidden({ timeout: 5_000 });
  });
});
