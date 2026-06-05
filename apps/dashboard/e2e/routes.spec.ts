import { test, expect } from "@playwright/test";

const ROUTES = [
  { path: "/", name: "Totals" },
  { path: "/trends", name: "Trends" },
  { path: "/models", name: "Models" },
  { path: "/agents", name: "Agents" },
  { path: "/calls", name: "Calls" },
  { path: "/sessions", name: "Sessions" },
  { path: "/cache", name: "Cache" },
  { path: "/latency", name: "Latency" },
  { path: "/ttft", name: "TTFT" },
  { path: "/tools", name: "Tools" },
  { path: "/heatmap", name: "Heatmap" },
  { path: "/finish", name: "Finish reasons" },
];

for (const route of ROUTES) {
  test(`route ${route.path} loads`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const t = msg.text();
        // Filter benign noise: SSR hydration warnings, vite chunks, favicon
        // 404s, and any generic "Failed to load resource" 404s (typically
        // static assets that don't affect functionality).
        if (/hydrating|hydration|chunk|favicon|webkit/i.test(t)) return;
        if (/Failed to load resource.*404/i.test(t)) return;
        errors.push(`console.error: ${t}`);
      }
    });
    const res = await page.goto(route.path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `status for ${route.path}`).toBe(200);

    // The dashboard pages don't use h1/h2 — assert AppShell mounted (brand text
    // is always present in the sidebar on desktop, in the SheetTrigger area on
    // mobile via the Activity icon's aria) and that the active nav link for
    // this route is visible somewhere on the page (sidebar on desktop, hidden
    // until hamburger opens on mobile — so we skip that check on mobile).
    await expect(page.locator("body")).toContainText(/copilot dashboard/i, { timeout: 10_000 });

    if (testInfo.project.name === "desktop-chromium") {
      // Sidebar nav is always present on desktop — link with this label exists.
      await expect(
        page.getByRole("link", { name: new RegExp(`^${route.name}$`, "i") }).first(),
      ).toBeVisible({ timeout: 10_000 });
    }

    expect(errors, `console errors on ${route.path}`).toEqual([]);
  });
}
