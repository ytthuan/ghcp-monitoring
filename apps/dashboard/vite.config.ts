import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
// @ts-expect-error -- plain ESM module, no types needed.
import { basicAuthMiddleware } from "./app/server/auth.mjs";
import { loadDashboardDevEnv } from "./dev-env";

loadDashboardDevEnv();

// Mirrors the production Basic Auth wired up in server.mjs so `pnpm dev`
// behaves the same way as the docker container. Registered as the FIRST
// plugin so its middleware runs before anything Vite or TanStack adds.
function basicAuthPlugin() {
  return {
    name: "ghcp-basic-auth",
    configureServer(server: any) {
      const user = process.env.DASHBOARD_USER ?? "admin";
      const pass = process.env.DASHBOARD_PASSWORD ?? "admin";
      const mw = basicAuthMiddleware({
        user,
        pass,
        skip: [
          "/api/healthz",
          "/favicon.svg",
          "/favicon.ico",
          "/@vite/",
          "/@react-refresh",
          "/@id/",
          "/@fs/",
          "/node_modules/",
          "/src/",
          "/app/",
          "/assets/",
          "/__server-fns/",
        ],
      });
      server.middlewares.use(mw);

      // Short-circuit /api/healthz to raw JSON in dev so it matches the
      // production bridge in server.mjs (which the e2e suite asserts on).
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url === "/api/healthz" || req.url === "/api/healthz/") {
          const url =
            process.env.CLICKHOUSE_URL ??
            `http://${process.env.CLICKHOUSE_HOST ?? "127.0.0.1"}:${process.env.CLICKHOUSE_PORT ?? "8123"}`;
          const chUser = process.env.CLICKHOUSE_USER ?? "default";
          const chPass = process.env.CLICKHOUSE_PASSWORD ?? "";
          const auth = Buffer.from(`${chUser}:${chPass}`).toString("base64");
          let body: any;
          try {
            const r = await fetch(`${url}/?query=SELECT+1`, {
              headers: { Authorization: `Basic ${auth}` },
              signal: AbortSignal.timeout(2000),
            });
            body = r.ok
              ? { ok: true, clickhouse: "reachable" }
              : { ok: false, clickhouse: `http ${r.status}` };
          } catch (err: any) {
            body = { ok: false, clickhouse: `unreachable: ${err?.message ?? err}` };
          }
          res.statusCode = body.ok ? 200 : 503;
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify(body));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  server: { port: 3000 },
  plugins: [
    basicAuthPlugin(),
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      srcDirectory: "app",
    }),
    viteReact(),
  ],
});
