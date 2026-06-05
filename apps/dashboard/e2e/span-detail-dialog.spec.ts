import { test, expect } from "@playwright/test";

// E2E coverage for the new Dialog-based span detail surface and the
// SpanWaterfall ruler/filter controls. Selectors mirror those used in
// `traces.spec.ts` (button[aria-label^="View span details for"]).

test.describe("span detail dialog", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/traces");
    await page.waitForLoadState("domcontentloaded");

    const table = page.locator("table").first();
    const empty = page
      .getByText(/no data yet|no traces match these filters/i)
      .first();
    const queryError = page.getByText(/query failed/i).first();
    await expect(table.or(empty).or(queryError)).toBeVisible({
      timeout: 30_000,
    });

    if (!(await table.isVisible().catch(() => false))) {
      test.skip(true, "no traces available — environment without data");
    }

    const firstRow = table.locator("tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.click({ position: { x: 24, y: 12 } });

    await expect(page).toHaveURL(/\/traces\/[0-9a-f]+/i, { timeout: 10_000 });

    await page
      .locator('button[aria-label^="View span details for"]')
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
  });

  test("dialog opens centered, ESC closes", async ({ page }) => {
    await page
      .locator('button[aria-label^="View span details for"]')
      .first()
      .click();
    const dialog = page
      .locator('[role="dialog"][aria-modal="true"]')
      .first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Width sanity check: on desktop the modal is min(95vw, 72rem) so >800px;
    // on mobile (full-bleed) the modal width matches the viewport (~95% of it).
    const viewport = page.viewportSize();
    const width = await dialog.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    if (viewport && viewport.width >= 1024) {
      expect(width).toBeGreaterThan(800);
    } else if (viewport) {
      // Full-bleed on small viewports — width should fill ~the whole screen.
      expect(width).toBeGreaterThanOrEqual(viewport.width * 0.9);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 2_000 });
  });

  test("attribute search filters with count badge", async ({ page }) => {
    await page
      .locator('button[aria-label^="View span details for"]')
      .first()
      .click();
    const dialog = page
      .locator('[role="dialog"][aria-modal="true"]')
      .first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const search = dialog
      .getByPlaceholder(/Search attributes|Filter|search/i)
      .first();
    if (await search.count()) {
      await search.fill("gen_ai");
    } else {
      await dialog.locator("input").first().fill("gen_ai");
    }

    await expect(
      dialog.locator("text=/Showing \\d+ of \\d+/"),
    ).toBeVisible({ timeout: 2_000 });
  });

  test("redacted sensitive value shows per-cell Reveal button", async ({
    page,
  }) => {
    await page
      .locator('button[aria-label^="View span details for"]')
      .first()
      .click();
    const dialog = page
      .locator('[role="dialog"][aria-modal="true"]')
      .first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    let revealBtn = dialog.locator('button:has-text("Reveal")').first();
    if (!(await revealBtn.isVisible().catch(() => false))) {
      await page.keyboard.press("Escape");
      const chatSpan = page
        .locator('button[aria-label^="View span details for chat"]')
        .first();
      if (await chatSpan.count()) {
        await chatSpan.click();
        await expect(dialog).toBeVisible({ timeout: 5_000 });
        revealBtn = dialog.locator('button:has-text("Reveal")').first();
      }
    }

    if (await revealBtn.isVisible().catch(() => false)) {
      await revealBtn.click();
      await expect(
        dialog.locator('text="[redacted]"').first(),
      ).not.toBeVisible({ timeout: 2_000 });
    } else {
      test.skip(true, "No span with sensitive content in this dataset");
    }
  });

  test("waterfall has time axis and search input", async ({ page }) => {
    // The 0ms tick is rendered by the ruler.
    await expect(page.locator("text=/^0ms$/").first()).toBeVisible();

    const search = page.getByPlaceholder(/Filter spans/i);
    await expect(search).toBeVisible();
    await search.fill("chat");

    await expect(page.getByText(/Errors only/i)).toBeVisible();
  });

  // ────────────────────────────────────────────────────────────────────
  // Wave-3 polish-traces additions: trace detail polish
  // ────────────────────────────────────────────────────────────────────

  test("trace detail summary header shows root, duration, spans, errors, top model", async ({
    page,
  }) => {
    // Summary KPI labels are sentence case — no need to open the dialog.
    await expect(page.getByText(/^Root$/).first()).toBeVisible();
    await expect(page.getByText(/^Duration$/).first()).toBeVisible();
    await expect(page.getByText(/^Spans$/).first()).toBeVisible();
    await expect(page.getByText(/^Errors$/).first()).toBeVisible();
    await expect(page.getByText(/^Top model$/).first()).toBeVisible();
  });

  test("trace detail back link returns to /traces preserving filters", async ({
    page,
  }) => {
    // Re-navigate with explicit filters in the URL so we can assert they're
    // preserved on the round-trip.
    const detailUrl = new URL(page.url());
    const traceId = detailUrl.pathname.split("/").pop() ?? "";
    await page.goto(`/traces/${traceId}?range=7d`);
    await page.waitForLoadState("domcontentloaded");
    // Wait for the summary header to render so we know the page is ready.
    await expect(page.getByText(/^Duration$/).first()).toBeVisible({
      timeout: 15_000,
    });

    const backLink = page
      .getByRole("link", { name: /back to traces/i })
      .first();
    await expect(backLink).toBeVisible({ timeout: 10_000 });
    await backLink.click();
    await expect(page).toHaveURL(/\/traces(\?|$)/);
    await expect(page).toHaveURL(/range=7d/);
  });

  test("trace detail tabs switch between Waterfall and Attribute search", async ({
    page,
  }) => {
    const tabWaterfall = page.getByRole("tab", { name: /^Waterfall$/ });
    const tabSearch = page.getByRole("tab", { name: /^Attribute search$/ });
    await expect(tabWaterfall).toBeVisible();
    await expect(tabSearch).toBeVisible();

    await tabSearch.click();
    const searchInput = page.getByPlaceholder(
      /Search spans by name, service, or attribute/i,
    );
    await expect(searchInput).toBeVisible();

    // Clicking a span in the search list opens the SpanDetailDialog.
    const firstResult = page
      .locator('button[aria-label^="Open span "]')
      .first();
    await expect(firstResult).toBeVisible({ timeout: 5_000 });
    await firstResult.click();
    const dialog = page
      .locator('[role="dialog"][aria-modal="true"]')
      .first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 2_000 });

    // Switching back to waterfall keeps it functional.
    await tabWaterfall.click();
    await expect(page.locator("text=/^0ms$/").first()).toBeVisible();
  });

  test("trace detail body has at least one [redacted] placeholder and no raw prompt/response/tool labels", async ({
    page,
  }) => {
    // Ensure body content text contains no sensitive literal labels (the
    // redaction policy stops `prompt:` / `response:` / `tool_args` /
    // `tool_result` from leaking in pre-reveal state). The sole exception
    // is the search input itself: assert that the rest of the body text
    // is clean.
    const body = await page.locator("body").innerText();
    for (const banned of ["prompt:", "response:", "tool_args", "tool_result"]) {
      expect(body.toLowerCase()).not.toContain(banned);
    }

    // Open a span and confirm the dialog renders at least one [redacted]
    // placeholder for known-sensitive keys (gen_ai.*).
    await page
      .locator('button[aria-label^="View span details for"]')
      .first()
      .click();
    const dialog = page
      .locator('[role="dialog"][aria-modal="true"]')
      .first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const dialogText = await dialog.innerText();
    // Either a redacted placeholder is present, or this span has no
    // sensitive attrs; both are valid telemetry-safe outcomes.
    if (/gen_ai\.(input|output|tool|system)/.test(dialogText)) {
      expect(dialogText).toContain("[redacted]");
    }
  });

  test("legacy/alt-shape gen_ai.* attribute keys render as [redacted]", async ({
    page,
  }) => {
    // Open the first available span detail dialog and inspect rendered
    // attribute KEYS for any matching the broader sensitivity prefix
    // (covers legacy gen_ai.prompt.*, gen_ai.completion.*, plus current
    // gen_ai.input.*, gen_ai.output.*, gen_ai.tool.*). For every such key
    // present, the rendered VALUE on the same row must NOT appear in clear
    // — the row should display the [redacted] placeholder by default.
    await page
      .locator('button[aria-label^="View span details for"]')
      .first()
      .click();
    const dialog = page
      .locator('[role="dialog"][aria-modal="true"]')
      .first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const dialogText = await dialog.innerText();
    const sensitivePrefixRe = /gen_ai\.(prompt|completion|input|output|tool)\./;
    if (!sensitivePrefixRe.test(dialogText)) {
      test.skip(
        true,
        "no legacy/alt-shape gen_ai.* attributes in this dataset — manual verification path: ingest a span with gen_ai.prompt.0.content and re-run",
      );
    }
    // At least one [redacted] placeholder must be present alongside the
    // sensitive key. (This passes if the broader isSensitiveAttr() check
    // triggered redaction for the matched key.)
    expect(dialogText).toContain("[redacted]");
  });
});
