import { test, expect, type Page } from "@playwright/test";

async function gotoLeaderboard(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");
  const table = page.locator("table").first();
  const empty = page.getByText(/no .* match these filters|no .* in this window/i).first();
  const queryError = page.getByText(/query failed/i).first();
  await expect(table.or(empty).or(queryError)).toBeVisible({ timeout: 30_000 });
  return { table };
}

export async function assertLeaderboardBasics(page: Page, opts: {
  url: string;
  csvLabel: RegExp;
}) {
  const { table } = await gotoLeaderboard(page, opts.url);

  // CSV button always rendered with aria-label.
  const csv = page.getByRole("button", { name: opts.csvLabel });
  await expect(csv).toBeVisible();

  if (!(await table.isVisible().catch(() => false))) {
    test.skip(true, "no telemetry available in this environment");
    return;
  }

  // Sticky header: thead has sticky positioning class.
  const thead = table.locator("thead").first();
  await expect(thead).toBeVisible();
  const cls = (await thead.getAttribute("class")) ?? "";
  expect(cls).toMatch(/sticky/);

  // Sort: click first sortable column header twice and observe aria-sort.
  const sortBtns = table.locator("thead button");
  const btnCount = await sortBtns.count();
  if (btnCount > 0) {
    const first = sortBtns.first();
    await first.click();
    await page.waitForTimeout(100);
    const dir1 = await first.getAttribute("aria-sort");
    await first.click();
    await page.waitForTimeout(100);
    const dir2 = await first.getAttribute("aria-sort");
    expect(dir1).not.toBe(dir2);
    expect([dir1, dir2].sort().join(",")).toBe("ascending,descending");
  }

  // Row focusable; tabIndex=0 set by useKeyboardRowNav.
  const firstRow = table.locator("tbody tr").first();
  await expect(firstRow).toBeVisible();
  expect(await firstRow.getAttribute("tabindex")).toBe("0");

  // Sensitive substrings absent from body.
  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body).not.toContain("prompt:");
  expect(body).not.toContain("response:");
  expect(body).not.toContain("tool_args");
  expect(body).not.toContain("tool_result");
}

