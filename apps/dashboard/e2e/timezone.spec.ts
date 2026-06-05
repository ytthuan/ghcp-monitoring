import { test, expect } from "@playwright/test";

// Verifies the timezone selector in the Header:
//   - Mounted with aria-label "Select timezone"
//   - Defaults to the browser's local IANA zone (Playwright pins UTC),
//     surfaced as "Local (UTC)" so operators can tell what "Local" means.
//   - Persists to localStorage["ghcp-dashboard-tz"] when changed and the
//     selection survives reload.
//   - Cascades: a tz change in the header re-renders timestamps everywhere.

test("default timezone resolves to the browser local zone", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    try {
      localStorage.removeItem("ghcp-dashboard-tz");
    } catch {
      /* ignore */
    }
  });
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  const tz = page.getByLabel(/select timezone/i).first();
  await expect(tz).toBeVisible({ timeout: 10_000 });
  // With Playwright pinned to UTC, "Local" resolves to UTC and the
  // dropdown shows "Local (UTC)" — proves the resolved zone is surfaced
  // in the trigger label rather than a static "Local (browser)" string.
  await expect(tz).toContainText(/Local \(UTC\)/i, { timeout: 10_000 });
  // No preference is written until the user makes a choice.
  const stored = await page.evaluate(() =>
    localStorage.getItem("ghcp-dashboard-tz"),
  );
  expect(stored).toBeNull();
});

test("changing timezone to Tokyo persists to localStorage", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    try {
      localStorage.removeItem("ghcp-dashboard-tz");
    } catch {
      /* ignore */
    }
  });
  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => {});

  const trigger = page.getByLabel(/select timezone/i).first();
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  await trigger.click();

  const tokyo = page.getByText(/^tokyo$/i).first();
  await expect(tokyo).toBeVisible({ timeout: 10_000 });
  await tokyo.click();

  await expect
    .poll(async () =>
      page.evaluate(() => localStorage.getItem("ghcp-dashboard-tz")),
    )
    .toBe("Asia/Tokyo");

  await expect(trigger).toContainText(/tokyo/i);

  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => {});
  const trigger2 = page.getByLabel(/select timezone/i).first();
  await expect(trigger2).toContainText(/tokyo/i);
});

test("timezone choice is read-back on a fresh navigation", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    try {
      localStorage.setItem("ghcp-dashboard-tz", "Asia/Tokyo");
    } catch {
      /* ignore */
    }
  });
  await page.goto("/trends");
  await page.waitForLoadState("domcontentloaded");
  const trigger = page.getByLabel(/select timezone/i).first();
  await expect(trigger).toContainText(/tokyo/i, { timeout: 10_000 });
});

test("invalid stored timezone falls back to local", async ({ page, context }) => {
  await context.addInitScript(() => {
    try {
      localStorage.setItem("ghcp-dashboard-tz", "Mars/Olympus_Mons");
    } catch {
      /* ignore */
    }
  });
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  const trigger = page.getByLabel(/select timezone/i).first();
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  await expect(trigger).toContainText(/Local/i, { timeout: 10_000 });
});

test("tz cascade: switching tz updates Time column on /logs", async ({
  page,
}) => {
  await page.goto("/logs");
  await page.evaluate(() => {
    try {
      localStorage.removeItem("ghcp-dashboard-tz");
    } catch {
      /* ignore */
    }
  });
  await page.reload();
  await page.waitForLoadState("networkidle").catch(() => {});

  const table = page.getByTestId("logs-table");
  await expect(table).toBeVisible({ timeout: 15_000 });
  const rowCount = await table.locator("tbody tr").count();
  test.skip(rowCount === 0, "no logs in dev stack to verify cascade");

  const firstCell = table.locator("tbody tr").first().locator("td").first();
  await expect(firstCell).toBeVisible({ timeout: 10_000 });
  const localText = (await firstCell.innerText()).trim();
  expect(localText.length).toBeGreaterThan(0);

  // Switch to Tokyo via the header dropdown.
  const trigger = page.getByLabel(/select timezone/i).first();
  await trigger.click();
  const tokyo = page.getByText(/^tokyo$/i).first();
  await expect(tokyo).toBeVisible({ timeout: 10_000 });
  await tokyo.click();

  await expect
    .poll(async () =>
      page.evaluate(() => localStorage.getItem("ghcp-dashboard-tz")),
    )
    .toBe("Asia/Tokyo");

  // Cascade proof: the same row's Time cell re-renders with a different
  // tz-formatted string. With Playwright in UTC, the "Local" default is
  // also UTC, so switching to Tokyo (UTC+9) must shift the visible text.
  await expect(firstCell).not.toHaveText(localText, { timeout: 10_000 });
});
