import { test, expect } from "@playwright/test";

// Verifies the <RefreshControl/> header widget and the <LanBanner/>:
//   - Refresh button (aria-label="Refresh data") is present and triggers a
//     server-fn call when clicked.
//   - Freshness label ("Last span: …" or "—") renders.
//   - Auto-refresh dropdown (aria-label="Auto-refresh interval") defaults to
//     Off and persists selection in localStorage["ghcp.autoRefreshSec"].
//   - LanBanner is hidden on loopback and shown when hostname is overridden.
//
// Auth is wired globally via playwright.config.ts (httpCredentials parsed
// from BASE_URL), so no extra headers are needed here.

test.describe("RefreshControl", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header").first()).toBeVisible();
  });

  test("freshness widget renders status badge + label or empty-state", async ({
    page,
  }) => {
    const btn = page.getByRole("button", { name: /refresh data/i });
    await expect(btn).toBeVisible();
    // The freshness wrapper has aria-label="Last span <relative>" regardless
    // of viewport size — the visible text differs (mobile hides the prefix),
    // but the label is stable.
    const label = page.locator('[aria-label^="Last span"]').first();
    await expect(label).toBeVisible();
  });

  test("clicking refresh shows busy state then completion status", async ({ page }) => {
    const refresh = page.getByTestId("refresh-data-button");
    await expect(refresh).toHaveAccessibleName(/refresh data/i);
    // Under dev-server hydration the first click can race React attaching
    // handlers. Retry until the UI proves the click started a refresh.
    await expect(async () => {
      await refresh.click();
      await expect(refresh).toHaveAttribute(
        "data-refresh-status",
        /refreshing|success|error/,
        { timeout: 1_000 },
      );
    }).toPass({ timeout: 10_000 });
    await expect(refresh).toHaveAttribute("data-refresh-status", /success|idle/, {
      timeout: 15_000,
    });
    await expect(page.getByTestId("refresh-status")).toHaveText(/Updated|^$/, {
      timeout: 15_000,
    });
  });

  test("auto-refresh dropdown defaults off and persists selection in localStorage", async ({
    page,
  }) => {
    await page.evaluate(() => window.localStorage.removeItem("ghcp.autoRefreshSec"));
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    const trigger = page
      .getByRole("button", { name: /auto-refresh interval/i })
      .first();
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText(/auto:\s*off/i);
    await expect
      .poll(async () =>
        page.evaluate(() => localStorage.getItem("ghcp.autoRefreshSec")),
      )
      .toBeNull();

    // Make sure no tooltip is hovering and no other element is grabbing
    // focus before we open the dropdown.
    await page.mouse.move(0, 0);
    await trigger.scrollIntoViewIfNeeded();
    // Radix DropdownMenu opens on mousedown. A plain Playwright click works,
    // but if SSR hydration races with a re-render the menu can flicker shut.
    // Retry the toggle until the portal is open.
    await expect(async () => {
      await trigger.click();
      // Look for any radix menu portal in open state — any descendant with
      // data-state=open and role=menu (or just menuitem inside).
      const open = page.locator('[role="menuitem"]').first();
      await expect(open).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 10_000 });

    const item30 = page.getByRole("menuitem").filter({ hasText: /30s/i }).first();
    await expect(item30).toBeVisible();
    await item30.click();

    await expect
      .poll(async () =>
        page.evaluate(() => localStorage.getItem("ghcp.autoRefreshSec")),
      )
      .toBe("30");

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const v2 = await page.evaluate(() =>
      localStorage.getItem("ghcp.autoRefreshSec"),
    );
    expect(v2).toBe("30");
    await expect(trigger).toContainText(/auto:\s*30s/i);

    await expect(async () => {
      await trigger.click();
      await expect(page.locator('[role="menuitem"]').first()).toBeVisible({
        timeout: 1500,
      });
    }).toPass({ timeout: 10_000 });

    const itemOff = page.getByRole("menuitem").filter({ hasText: /^Auto-refresh:\s*Off$/i }).first();
    await expect(itemOff).toBeVisible();
    await itemOff.click();

    await expect
      .poll(async () =>
        page.evaluate(() => localStorage.getItem("ghcp.autoRefreshSec")),
      )
      .toBe("0");

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(trigger).toContainText(/auto:\s*off/i);
  });
});

test.describe("LanBanner", () => {
  test("not shown on loopback", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    // Banner uses role="status" and contains the substring "LAN".
    const banner = page.getByRole("status").filter({ hasText: /LAN/i });
    await expect(banner).toHaveCount(0);
  });

  test("shown when forced via ?lan=force escape hatch", async ({ page }) => {
    // window.location.hostname is read-only in browsers and can't be reliably
    // shadowed from a Playwright init script. The component supports a
    // ?lan=force query param so e2e (and operators previewing the banner
    // before flipping bind hosts) can trigger it without changing the host
    // header. This proves the banner renders end-to-end; the loopback
    // suppression case above proves it stays hidden by default.
    await page.goto("/?lan=force");
    await page.waitForLoadState("domcontentloaded");
    const banner = page.getByRole("status").filter({ hasText: /LAN/i });
    await expect(banner.first()).toBeVisible({ timeout: 5_000 });
  });
});
