import { test, expect } from "@playwright/test";

// Verifies the click-to-open <CostCell/> popover on /calls:
//   - A trigger button with $X.YZ exists for rows whose row priced cleanly.
//   - Clicking opens a Radix popover (role=dialog).
//   - It contains the 4 component labels and the "priced as" footer.
//   - The 4 component dollar amounts in the popover sum to the trigger amount.

function parseUsd(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/-?\$\s*([\d,]+(?:\.\d+)?)/);
  if (!m || !m[1]) return null;
  return Number(m[1].replace(/,/g, ""));
}

test("cost cell opens breakdown popover and components sum to total", async ({
  page,
}) => {
  await page.goto("/calls");
  await page.waitForLoadState("domcontentloaded");

  // Wait for either real data, an empty-state, or a query error.
  const table = page.locator("table").first();
  const empty = page.getByText(/no data yet/i).first();
  const queryError = page.getByText(/query failed/i).first();
  await expect(table.or(empty).or(queryError)).toBeVisible({ timeout: 30_000 });

  if (!(await table.isVisible().catch(() => false))) {
    test.skip(true, "no data available — cannot verify cost popover");
  }

  // Triggers are buttons with aria-label starting "Cost breakdown:".
  const triggers = page.getByRole("button", { name: /^Cost breakdown:/ });
  await expect(triggers.first()).toBeVisible({ timeout: 15_000 });

  const count = await triggers.count();
  let opened = false;
  for (let i = 0; i < count; i += 1) {
    const trigger = triggers.nth(i);
    const triggerText = (await trigger.textContent())?.trim() ?? "";
    const triggerUsd = parseUsd(triggerText);
    if (triggerUsd == null || triggerUsd === 0) continue;

    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();

    const dialog = page.locator('[role="dialog"]').last();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await expect(dialog).toContainText("input");
    await expect(dialog).toContainText("output");
    await expect(dialog).toContainText("cache_read");
    await expect(dialog).toContainText("cache_create");
    await expect(dialog).toContainText(/priced as/i);

    // Sum the 4 component dollar amounts (rows are the 4 sensitive components).
    const rowLabels = ["input", "output", "cache_read", "cache_create"];
    let sum = 0;
    for (const label of rowLabels) {
      const row = dialog.locator("tr", { hasText: new RegExp(`^${label}$`, "i") }).first();
      // Fall back to substring match if the label cell isn't strictly equal.
      const rowFinal = (await row.count()) > 0
        ? row
        : dialog.locator("tr", { hasText: new RegExp(label) }).first();
      const usdCell = rowFinal.locator("td").last();
      const usdText = (await usdCell.textContent())?.trim() ?? "";
      const v = parseUsd(usdText);
      expect(v, `component ${label} should parse: "${usdText}"`).not.toBeNull();
      sum += v ?? 0;
    }

    expect(Math.abs(sum - triggerUsd)).toBeLessThan(0.0001 + triggerUsd * 1e-6);
    opened = true;
    break;
  }

  expect(opened, "expected at least one priced row in the table").toBe(true);
});
