import { defineConfig, devices } from "@playwright/test";
import { loadDashboardDevEnv } from "./dev-env";

loadDashboardDevEnv();

// BASE_URL may include URL-embedded creds (e.g. `http://admin:secret@…`) for
// convenience. Chromium strips creds from dynamic ESM imports — so we parse
// the creds out and pass them via `httpCredentials` instead, then strip them
// from baseURL. When BASE_URL omits creds, we fall back to the effective
// DASHBOARD_USER / DASHBOARD_PASSWORD from the local dev env contract.
const RAW_BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:6969";
const parsed = new URL(RAW_BASE_URL);
const credUser =
  decodeURIComponent(parsed.username || "") ||
  process.env.DASHBOARD_USER ||
  "admin";
const credPass =
  decodeURIComponent(parsed.password || "") ||
  process.env.DASHBOARD_PASSWORD ||
  "admin";
parsed.username = "";
parsed.password = "";
const BASE_URL = parsed.toString().replace(/\/$/, "");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: BASE_URL,
    httpCredentials: credUser
      ? { username: credUser, password: credPass }
      : undefined,
    // Pin the test browser timezone so tz-sensitive UI behaves the same
    // regardless of the dev machine. Tests that exercise timezone-aware
    // code can override this on a per-test basis via test.use().
    timezoneId: "UTC",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 14"] },
    },
  ],
});
