import { test, expect } from "@playwright/test";

// Verifies that switching the timezone selector on /calls shifts the
// displayed Timestamp column values. The dashboard SQL now emits ISO
// strings with a trailing `Z`, and the client formatter (formatInTz)
// defensively coerces bare ISO to UTC. So changing tz from UTC to
// Asia/Tokyo should re-render every timestamp cell.
//
// The test is tolerant of "no rows" (the dev corpus may be empty) and
// of varying display formats — the primary assertion is that the cell
// text DIFFERS after the tz change. A secondary best-effort check
// verifies the +9h offset when the format is parseable.

test.describe("calls page respects timezone", () => {
  test("timestamp display shifts when timezone changes (UTC → Tokyo)", async ({
    page,
  }) => {
    await page.goto("/calls");
    // Clear timezone preference ONCE after first navigation, then let
    // subsequent reloads honor whatever the test sets. Using
    // page.addInitScript here would re-clear on every reload, which
    // defeats the persistence-after-reload assertion below.
    await page.evaluate(() => {
      try {
        localStorage.removeItem("ghcp-dashboard-tz");
      } catch {
        // ignore
      }
    });
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});

    // Confirm the tz selector starts at the resolved local zone.
    // Playwright pins UTC, so default "local" surfaces as "Local (UTC)".
    const tzTrigger = page.getByLabel(/select timezone/i).first();
    await expect(tzTrigger).toBeVisible({ timeout: 10_000 });
    await expect(tzTrigger).toContainText(/UTC/i);

    // Skip gracefully if no data rows are present in this run.
    const firstRow = page.locator("table tbody tr").first();
    const rowCount = await page
      .locator("table tbody tr")
      .count()
      .catch(() => 0);
    test.skip(rowCount === 0, "no calls data in this run");

    const firstCell = firstRow.locator("td").first();
    await expect(firstCell).toBeVisible({ timeout: 10_000 });
    const utcText = (await firstCell.innerText()).trim();
    expect(utcText.length).toBeGreaterThan(0);

    // Switch timezone via the header combobox (same pattern as
    // e2e/timezone.spec.ts).
    await tzTrigger.click();
    const tokyo = page.getByText(/^tokyo$/i).first();
    await expect(tokyo).toBeVisible({ timeout: 10_000 });
    await tokyo.click();

    // Persistence side-effect — sanity check.
    await expect
      .poll(async () =>
        page.evaluate(() => localStorage.getItem("ghcp-dashboard-tz")),
      )
      .toBe("Asia/Tokyo");

    // The cell should re-render with a new tz-formatted string.
    await expect(firstCell).not.toHaveText(utcText, { timeout: 10_000 });
    const tokyoText = (await firstCell.innerText()).trim();
    expect(tokyoText).not.toBe(utcText);

    // Best-effort: if both texts contain a parseable HH:MM, verify the
    // Tokyo hour is UTC + 9 (mod 24). This is loose by design — any
    // unexpected format just falls through without failing the test.
    const hourRe = /(\d{1,2}):(\d{2})/;
    const utcHm = utcText.match(hourRe);
    const tokyoHm = tokyoText.match(hourRe);
    if (utcHm && tokyoHm) {
      const utcH = Number(utcHm[1]);
      const tokyoH = Number(tokyoHm[1]);
      const expected = (utcH + 9) % 24;
      // Soft assertion via expect.soft so format quirks don't fail
      // the test; the strict diff above is the hard contract.
      expect.soft(tokyoH).toBe(expected);
    }

    // Reload — Tokyo formatting should persist via localStorage.
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});
    const tzTrigger2 = page.getByLabel(/select timezone/i).first();
    await expect(tzTrigger2).toContainText(/tokyo/i, { timeout: 10_000 });

    const firstCellAfterReload = page
      .locator("table tbody tr")
      .first()
      .locator("td")
      .first();
    // If rows still present after reload, the formatted text should
    // remain in Tokyo (i.e. NOT equal to the original UTC string).
    if (await firstCellAfterReload.isVisible().catch(() => false)) {
      await expect(firstCellAfterReload).not.toHaveText(utcText, {
        timeout: 10_000,
      });
    }
  });
});
