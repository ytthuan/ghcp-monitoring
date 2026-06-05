import { test, expect, request } from "@playwright/test";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:6969").replace(/^https?:\/\/[^@]+@/, "http://");

// Run auth contract tests only once (desktop-chromium project) — the contract
// is server-side and not browser-specific.
test.describe("auth", () => {
  test.beforeEach((_fixtures, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "runs once on desktop-chromium");
  });

  test("401 without credentials", async () => {
    // Explicit `httpCredentials: undefined` overrides the global use.httpCredentials
    // configured in playwright.config.ts so this request is unauthenticated.
    const ctx = await request.newContext({ httpCredentials: undefined });
    const res = await ctx.get(`${BASE}/`);
    expect(res.status()).toBe(401);
    expect(res.headers()["www-authenticate"]).toMatch(/Basic realm="Copilot Dashboard"/);
  });

  test("401 with bad credentials", async () => {
    const ctx = await request.newContext({
      httpCredentials: { username: "admin", password: "wrong" },
    });
    const res = await ctx.get(`${BASE}/`);
    expect(res.status()).toBe(401);
  });

  test("200 with valid credentials", async () => {
    // Read the password from BASE_URL (Playwright config injects it via
    // httpCredentials too) so this test stays correct after the rotation
    // recorded in ADR-0004. Falls back to admin/admin for fresh dev clones.
    const m = (process.env.BASE_URL ?? "").match(/^https?:\/\/([^:]+):([^@]+)@/);
    const username = m?.[1] ?? process.env.DASHBOARD_USER ?? "admin";
    const password = m?.[2] ?? process.env.DASHBOARD_PASSWORD ?? "admin";
    const ctx = await request.newContext({
      httpCredentials: { username, password },
    });
    const res = await ctx.get(`${BASE}/`);
    expect(res.status()).toBe(200);
  });

  test("/api/healthz unauthenticated returns JSON with ok flag", async () => {
    const ctx = await request.newContext({ httpCredentials: undefined });
    const res = await ctx.get(`${BASE}/api/healthz`);
    // Either 200 (ClickHouse reachable) or 503 (unreachable) is acceptable —
    // the contract is the JSON shape, not the live ClickHouse status. Dev
    // mode runs against the host without ClickHouse port exposure (per the
    // security gate) so it returns 503; prod inside docker returns 200.
    expect([200, 503]).toContain(res.status());
    expect(res.headers()["content-type"]).toMatch(/application\/json/);
    const body = await res.json();
    expect(body).toHaveProperty("ok");
    expect(body).toHaveProperty("clickhouse");
  });
});
