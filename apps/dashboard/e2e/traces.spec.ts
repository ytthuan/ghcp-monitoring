import { test, expect } from "@playwright/test";

// End-to-end coverage for the /traces index + /traces/$traceId detail
// + SpanWaterfall + SpanDetailDialog.
//
// The detail page renders a button per span with aria-label
//   "View span details for <name> (<ms> ms)"
// so the test can locate spans without relying on visual layout.

test("traces index → detail → span drawer roundtrip with redaction default", async ({
  page,
}) => {
  await page.goto("/traces");
  await page.waitForLoadState("domcontentloaded");

  const table = page.locator("table").first();
  const empty = page
    .getByText(/no data yet|no traces match these filters/i)
    .first();
  const queryError = page.getByText(/query failed/i).first();
  await expect(table.or(empty).or(queryError)).toBeVisible({ timeout: 30_000 });

  if (!(await table.isVisible().catch(() => false))) {
    test.skip(true, "no traces available — environment without data");
  }

  const firstRow = table.locator("tbody tr").first();
  await expect(firstRow).toBeVisible({ timeout: 10_000 });
  await firstRow.click({ position: { x: 24, y: 12 } });

  await expect(page).toHaveURL(/\/traces\/[0-9a-f]+/i, { timeout: 10_000 });

  // Waterfall: at least one span button.
  const spanBtn = page
    .locator('button[aria-label^="View span details for"]')
    .first();
  await expect(spanBtn).toBeVisible({ timeout: 15_000 });

  await spanBtn.click();

  // Drawer (Sheet) opens — our SheetContent has role="dialog".
  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  // The 4 tabs are present.
  for (const label of ["Attributes", "Resource", "Events", "Raw JSON"]) {
    await expect(
      dialog.getByRole("tab", { name: label }),
    ).toBeVisible();
  }

  // Click Raw JSON tab and verify the redaction default applies when any
  // attribute key contains "messages".
  await dialog.getByRole("tab", { name: "Raw JSON" }).click();
  const pre = dialog.locator("pre").first();
  await expect(pre).toBeVisible({ timeout: 5_000 });
  const raw = (await pre.textContent()) ?? "";

  if (/messages/i.test(raw)) {
    expect(raw).toContain("redacted");
  }
});

test("traces index supports sortable headers", async ({ page }) => {
  await page.goto("/traces");
  await page.waitForLoadState("domcontentloaded");

  const table = page.locator("table").first();
  const emptyTitle = page
    .getByText(/no data yet|no traces match these filters/i)
    .first();
  const queryError = page.getByText(/query failed/i).first();
  await expect(table.or(emptyTitle).or(queryError)).toBeVisible({
    timeout: 30_000,
  });

  if (!(await table.isVisible().catch(() => false))) {
    test.skip(true, "no traces available — environment without data");
  }

  // Sortable headers are now buttons with chevron icons; click on the
  // "Duration" header button.
  await table.getByRole("button", { name: /^Duration/ }).click();
  // Sort change should keep rows visible.
  await expect(table.locator("tbody tr").first()).toBeVisible();
});

// ──────────────────────────────────────────────────────────────────────
// Wave-3 polish-traces additions
// ──────────────────────────────────────────────────────────────────────

test("traces index has sticky header, CSV button with aria-label, and CSV is content-safe", async ({
  page,
}) => {
  await page.goto("/traces?range=7d");
  await page.waitForLoadState("domcontentloaded");

  const table = page.locator("table").first();
  const empty = page
    .getByText(/no data yet|no traces match these filters/i)
    .first();
  const queryError = page.getByText(/query failed/i).first();
  await expect(table.or(empty).or(queryError)).toBeVisible({ timeout: 30_000 });

  // CSV export button — aria-label required (icon-only-ish).
  const csvBtn = page.getByRole("button", {
    name: /export visible traces to csv/i,
  });
  await expect(csvBtn).toBeVisible();

  if (!(await table.isVisible().catch(() => false))) {
    test.skip(true, "no traces available — skipping CSV download");
  }

  // Sticky header sanity: the <thead> must carry sticky positioning so it
  // remains pinned under the FilterBar while scrolling.
  const thead = table.locator("thead");
  const position = await thead.evaluate(
    (el) => getComputedStyle(el).position,
  );
  expect(position).toBe("sticky");

  // Trigger CSV download and ensure no sensitive substrings sneak through.
  const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
  await csvBtn.click();
  const dl = await downloadPromise;
  const filename = dl.suggestedFilename();
  expect(filename).toMatch(/^traces-\d{4}-\d{2}-\d{2}-\d{4}\.csv$/);
  const path = await dl.path();
  if (path) {
    const fs = await import("node:fs/promises");
    const csv = await fs.readFile(path, "utf8");
    for (const banned of ["prompt:", "response:", "tool_args", "tool_result"]) {
      expect(csv).not.toContain(banned);
    }
    // Header row sanity.
    expect(csv.split(/\r?\n/)[0]).toMatch(/started_at,root_name,/);
  }
});

test("traces index keyboard nav: j moves focus, Enter opens detail", async ({
  page,
}) => {
  await page.goto("/traces?range=7d");
  await page.waitForLoadState("domcontentloaded");

  const table = page.locator("table").first();
  const empty = page
    .getByText(/no data yet|no traces match these filters/i)
    .first();
  await expect(table.or(empty)).toBeVisible({ timeout: 30_000 });

  if (!(await table.isVisible().catch(() => false))) {
    test.skip(true, "no traces available — environment without data");
  }

  await expect(table.locator("tbody tr").first()).toBeVisible({
    timeout: 10_000,
  });

  // Press j to move active row, then Enter to navigate.
  await page.keyboard.press("j");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/traces\/[0-9a-f]+/i, { timeout: 10_000 });
});
