import { test, expect } from "@playwright/test";

// Wave-3 polish-sessions e2e regressions for the Sessions list and
// Session detail pages. Mirrors the pattern in traces.spec.ts: tests
// gracefully skip when the dev/CI environment has no telemetry data.

test("sessions list: sortable headers + sticky header + j/Enter opens detail", async ({
  page,
}) => {
  await page.goto("/sessions");
  await page.waitForLoadState("domcontentloaded");

  const table = page.locator("table").first();
  const empty = page.getByText(/no sessions in this range|no data yet/i).first();
  const queryError = page.getByText(/query failed/i).first();
  await expect(table.or(empty).or(queryError)).toBeVisible({ timeout: 30_000 });

  if (!(await table.isVisible().catch(() => false))) {
    test.skip(true, "no sessions available — environment without data");
  }

  // Sticky header: TableHeader has the `sticky` class.
  const header = table.locator("thead").first();
  await expect(header).toHaveClass(/sticky/);

  // Sort header is a button with aria-sort on its <th>.
  const callsHeader = table.getByRole("columnheader", { name: /^Calls/ });
  await expect(callsHeader).toBeVisible();
  await callsHeader.getByRole("button").click();
  await expect(callsHeader).toHaveAttribute("aria-sort", /ascending|descending/);

  const firstRow = page.locator('[data-testid="session-row"]').first();
  await expect(firstRow).toBeVisible();

  // Keyboard nav: focus the page body, press j then Enter to open detail.
  await page.locator("body").click();
  await page.keyboard.press("j");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/sessions\/.+/, { timeout: 10_000 });
});

test("session detail: breadcrumb + summary + timeline + redaction default", async ({
  page,
}) => {
  // Pre-set a filter so we can verify breadcrumb back-link preserves search.
  await page.goto("/sessions?range=7d");
  await page.waitForLoadState("domcontentloaded");

  const table = page.locator("table").first();
  const empty = page.getByText(/no sessions in this range|no data yet/i).first();
  await expect(table.or(empty)).toBeVisible({ timeout: 30_000 });
  if (!(await table.isVisible().catch(() => false))) {
    test.skip(true, "no sessions available — environment without data");
  }

  await page.locator('[data-testid="session-row"]').first().click();
  await expect(page).toHaveURL(/\/sessions\/.+/, { timeout: 10_000 });

  // Summary header: session id + copy button + turn count + total tokens.
  await expect(page.locator('[data-testid="session-id"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: /copy session id/i }),
  ).toBeVisible();
  await expect(page.locator('[data-testid="stat-turns"]')).toBeVisible();
  await expect(page.locator('[data-testid="stat-total-tokens"]')).toBeVisible();

  // Timeline: at least one turn item.
  const turnItems = page.locator('[data-testid="turn-item"]');
  await expect(turnItems.first()).toBeVisible();
  const initialCount = await turnItems.count();
  expect(initialCount).toBeGreaterThan(0);

  // Expand all toggles all previews.
  const expandAll = page.locator('[data-testid="expand-all-toggle"]');
  await expandAll.click();
  await expect(page.locator('[data-testid="turn-preview"]')).toHaveCount(
    initialCount,
  );

  // Each preview body still renders the redaction default. RevealableCell
  // shows "[redacted, click to reveal]" before the user clicks Reveal.
  await expect(
    page.getByText(/\[redacted, click to reveal\]/i).first(),
  ).toBeVisible();

  // Telemetry-safety guard: the document body must not contain raw
  // prompt/response/tool-arg/tool-result content while previews are
  // collapsed-or-default (no Reveal click happened).
  const bodyText = await page.locator("body").innerText();
  for (const banned of [
    "tool_args",
    "tool_result",
    "input_messages",
    "output_messages",
  ]) {
    expect(
      bodyText.toLowerCase().includes(banned),
      `body should not contain '${banned}' before explicit reveal`,
    ).toBe(false);
  }

  // Collapse all → previews unmount.
  await expandAll.click();
  await expect(page.locator('[data-testid="turn-preview"]')).toHaveCount(0);

  // Breadcrumb back link returns to /sessions with prior search preserved.
  const back = page.getByRole("link", { name: /back to sessions/i });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/sessions(\?.*)?$/);
  // The range search param survives navigation back.
  expect(page.url()).toContain("range=7d");
});
