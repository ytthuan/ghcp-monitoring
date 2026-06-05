/**
 * /logs page e2e — Wave-3 polish.
 *
 * Covers the new ingestion-health status rows, the auto-refresh toggle,
 * severity multi-select + URL state, jump-to-trace links, j/k keyboard
 * navigation, default-redacted log bodies, and the negative assertion that
 * the page never offers a CSV export of potentially sensitive log content.
 */
import { test, expect, type Page } from "@playwright/test";

async function gotoLogs(page: Page) {
  await page.goto("/logs");
  await page.waitForLoadState("domcontentloaded");
  // Wait for either the status rows to render or the loading/error state to
  // settle — polling keeps the test robust against backend cold-start jitter.
  await expect(page.getByText("Ingestion health", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("/logs page (wave-3 polish)", () => {
  test("ingestion-health card shows OK/Stale/Down badges per OTel table", async ({ page }) => {
    await gotoLogs(page);
    const rows = page.getByTestId("ingestion-status-rows");
    await expect(rows).toBeVisible({ timeout: 15_000 });

    for (const name of ["otel_traces", "otel_logs", "otel_metrics"]) {
      const badge = page.getByTestId(`ingestion-badge-${name}`);
      await expect(badge).toBeVisible({ timeout: 15_000 });
      await expect(badge).toHaveText(/^(OK|Stale|Down)$/);
    }
  });

  test("auto-refresh toggle persists across reload (localStorage)", async ({ page }) => {
    // Start from a clean slate — default state should be paused to avoid
    // unnecessary ClickHouse polling.
    await page.goto("/logs");
    await page.evaluate(() => window.localStorage.removeItem("dashboard:logs:autoRefresh"));
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Ingestion health", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    const toggle = page.getByTestId("logs-autorefresh-toggle");
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveText(/auto-refresh paused/i);
    // Under parallel test load the page can take a moment to hydrate before
    // React's onClick is attached — retry the click until the state flips.
    await expect
      .poll(
        async () => {
          await toggle.click();
          return await toggle.textContent();
        },
        { timeout: 10_000, intervals: [200, 400, 800] },
      )
      .toMatch(/auto-refreshing every 15s/i);
    await expect
      .poll(async () =>
        page.evaluate(() => localStorage.getItem("dashboard:logs:autoRefresh")),
      )
      .toBe("true");

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const toggleAfter = page.getByTestId("logs-autorefresh-toggle");
    await expect(toggleAfter).toHaveText(/auto-refreshing every 15s/i, { timeout: 15_000 });

    await expect
      .poll(
        async () => {
          await toggleAfter.click();
          return await toggleAfter.textContent();
        },
        { timeout: 10_000, intervals: [200, 400, 800] },
      )
      .toMatch(/auto-refresh paused/i);
    await expect
      .poll(async () =>
        page.evaluate(() => localStorage.getItem("dashboard:logs:autoRefresh")),
      )
      .toBe("false");
  });

  test("severity multi-select hides excluded rows and updates URL", async ({ page }) => {
    await gotoLogs(page);
    const table = page.getByTestId("logs-table");
    await expect(table).toBeVisible({ timeout: 15_000 });
    const initialRows = await table.locator("tbody tr").count();
    test.skip(initialRows === 0, "no logs in dev stack to filter");

    await page.getByTestId("logs-severity-filter").click();
    await page.getByTestId("logs-sev-opt-ERROR").click();
    // Close menu by pressing Escape.
    await page.keyboard.press("Escape");

    await expect
      .poll(() => page.url(), { timeout: 5_000 })
      .toMatch(/severities=ERROR/);

    // Either zero rows (no ERRORs) → empty state copy, OR all visible rows
    // are ERROR-badged. Both prove the filter works.
    await expect
      .poll(
        async () => {
          const empty = await page.getByText(/no logs match this filter/i).isVisible().catch(() => false);
          if (empty) return "empty";
          const badges = await page.locator("[data-testid=logs-row] td:nth-child(2)").allTextContents();
          if (badges.length === 0) return "empty";
          return badges.every((b) => b.trim().toUpperCase() === "ERROR") ? "filtered" : "stale";
        },
        { timeout: 10_000 },
      )
      .toMatch(/^(filtered|empty)$/);
  });

  test("sortable metadata headers toggle aria-sort and URL state", async ({ page }) => {
    await gotoLogs(page);
    const table = page.getByTestId("logs-table");
    await expect(table).toBeVisible({ timeout: 15_000 });

    const severityHead = table.locator("thead th").filter({ hasText: "Severity" }).first();
    const severityButton = severityHead.getByRole("button", { name: /severity/i });
    await expect(severityButton).toBeVisible();
    await expect(severityHead).toHaveAttribute("aria-sort", "none");

    await severityButton.click();
    await expect(severityHead).toHaveAttribute("aria-sort", "ascending");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("sortBy"))
      .toBe("severity");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("sortDir"))
      .toBe("asc");

    await severityButton.click();
    await expect(severityHead).toHaveAttribute("aria-sort", "descending");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("sortDir"))
      .toBe("desc");

    const timeHead = table.locator("thead th").filter({ hasText: "Time" }).first();
    await timeHead.getByRole("button", { name: /time/i }).click();
    await expect(timeHead).toHaveAttribute("aria-sort", "ascending");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("sortBy"))
      .toBe("timestamp");
  });

  test("jump-to-trace link navigates to /traces/<id>", async ({ page }) => {
    await gotoLogs(page);
    const table = page.getByTestId("logs-table");
    await expect(table).toBeVisible({ timeout: 15_000 });
    const linkLocator = table.locator("a[aria-label^='Open trace ']").first();
    const linkCount = await linkLocator.count();
    test.skip(linkCount === 0, "no log rows with trace_id in dev stack");

    const href = await linkLocator.getAttribute("href");
    expect(href).toMatch(/^\/traces\/[0-9a-f]+/i);
    await linkLocator.click();
    await expect(page).toHaveURL(/\/traces\/[0-9a-f]+/i, { timeout: 10_000 });
  });

  test("pressing j then Enter on a log row opens the trace", async ({ page }) => {
    await gotoLogs(page);
    const table = page.getByTestId("logs-table");
    await expect(table).toBeVisible({ timeout: 15_000 });

    const rows = table.locator("[data-testid=logs-row]");
    const rowCount = await rows.count();
    test.skip(rowCount === 0, "no logs in dev stack");

    // Find the first row index whose trace cell exposes a jump-to-trace
    // link (some log rows have empty trace_id and only the linked rows are
    // navigable via Enter).
    let target = -1;
    for (let i = 0; i < rowCount; i++) {
      if ((await rows.nth(i).locator("a[aria-label^='Open trace ']").count()) > 0) {
        target = i;
        break;
      }
    }
    test.skip(target < 0, "no log rows with trace_id in dev stack");

    // Move focus out of any text input, then press 'j' enough times to land
    // on the target row (initial activeIndex is 0; each 'j' advances by 1).
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    for (let i = 0; i < target; i++) {
      await page.keyboard.press("j");
    }
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/traces\/[0-9a-f]+/i, { timeout: 10_000 });
  });

  test("long log bodies render at least one [redacted] placeholder", async ({ page }) => {
    await gotoLogs(page);
    const table = page.getByTestId("logs-table");
    await expect(table).toBeVisible({ timeout: 15_000 });
    const rowCount = await table.locator("tbody tr").count();
    test.skip(rowCount === 0, "no logs in dev stack to redact");

    // The redact heuristic only fires for long (>200 char) INFO/DEBUG bodies
    // that don't pass the safe-JSON shape check. Detect whether the dev
    // stack actually contains such bodies; if every visible body cell is
    // short, there's nothing to redact and the assertion is vacuous.
    const plainBodies = await page
      .locator("[data-testid=log-body-plain]")
      .allTextContents();
    const hasLongBody = plainBodies.some((b) => b.length > 200);
    const redactedCount = await page.getByTestId("log-body-redacted").count();
    test.skip(
      !hasLongBody && redactedCount === 0,
      "dev stack has no long log bodies — redaction has nothing to hide",
    );

    // Contract: any time a long, non-WARN/ERROR body shows up it MUST be
    // redacted by default.
    expect(redactedCount).toBeGreaterThan(0);
  });

  test("page body never leaks raw prompt/response/tool substrings", async ({ page }) => {
    await gotoLogs(page);
    const body = await page.locator("body").innerText();
    // Heuristic guard: if any of these substrings show up unprompted, the
    // redact policy regressed. The aria-label "Reveal log body" never uses
    // these tokens; the table headers say "Body", "Trace", "Severity", etc.
    expect(body).not.toMatch(/\bprompt:\s*/i);
    expect(body).not.toMatch(/\bresponse:\s*/i);
    expect(body).not.toContain("tool_args");
    expect(body).not.toContain("tool_result");
  });

  test("no CSV export button is rendered", async ({ page }) => {
    await gotoLogs(page);
    // Negative assertion: log content can be sensitive — never offer a
    // bulk-export shortcut on this page.
    await expect(page.getByRole("button", { name: /export.*csv/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /export.*csv/i })).toHaveCount(0);
    await expect(page.getByText(/download csv/i)).toHaveCount(0);
  });

  test("JSON body whose top-level keys include the broadened sensitive set defaults to [redacted]", async ({ page }) => {
    // Wave-D security follow-up (M2): SENSITIVE_KEY_RE was extended to
    // cover messages|content|arguments|result|completion|input|output in
    // addition to the original prompt|response|tool. We can't synthesize a
    // log row from the dashboard UI and the /logs data source is a
    // TanStack Start server function (not a plain HTTP route easily
    // reachable from page.route()), so we verify against whatever the dev
    // stack happens to expose: every visible long, non-WARN/ERROR body
    // that JSON-parses to an object containing one of the new keys MUST
    // be redacted (i.e. show the [redacted, click to reveal] button, not
    // a plain body cell).
    await gotoLogs(page);
    const table = page.getByTestId("logs-table");
    await expect(table).toBeVisible({ timeout: 15_000 });

    const plainBodies = await page
      .locator("[data-testid=log-body-plain]")
      .allTextContents();
    const newSensitiveKeyRe = /^(messages?|content|arguments?|results?|completion|input|output)$/i;
    const leaks = plainBodies.filter((b) => {
      if (b.length <= 200) return false;
      const trimmed = b.trim();
      if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return false;
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return Object.keys(parsed as Record<string, unknown>).some((k) =>
            newSensitiveKeyRe.test(k),
          );
        }
        return false;
      } catch {
        return false;
      }
    });
    // No clear-text body in the table may have a top-level
    // messages/content/arguments/result/completion/input/output key.
    expect(leaks).toEqual([]);

    // Manual verification path when the dev stack contains no such body:
    //   1) Emit an OTel log with a body of `{"messages":[{"role":"user",
    //      "content":"…200+ chars…"}]}` and severity INFO.
    //   2) Open /logs and confirm the row renders the
    //      [redacted, click to reveal] button by default.
  });
});
