// Node HTTP bridge for the TanStack Start fetch handler.
// The Vite build emits dist/server/server.js exporting a Web-Fetch-compatible
// handler ({ fetch(request): Response }). This script wraps it with a Node
// http.createServer so the dashboard can run as a plain Node process inside
// the Docker container without pulling in @hono/node-server or similar.
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { createReadStream, statSync } from "node:fs";
import { resolve, normalize, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./dist/server/server.js";
import { basicAuthMiddleware } from "./app/server/auth.mjs";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const AUTH_USER = process.env.DASHBOARD_USER ?? "admin";
const AUTH_PASS = process.env.DASHBOARD_PASSWORD ?? "admin";

// Skip /api/healthz so Docker HEALTHCHECK and validate.sh can probe without
// credentials. Skip favicons so the browser's preflight icon fetch doesn't
// trigger an extra 401 round-trip per page load. Skip /assets/ because the
// browser does NOT send Basic Auth credentials with dynamic ESM module
// imports — gating these would break SPA hydration. Static asset bundles
// are not sensitive (the data API and SSR routes still require auth).
const requireAuth = basicAuthMiddleware({
  user: AUTH_USER,
  pass: AUTH_PASS,
  skip: ["/api/healthz", "/favicon.svg", "/favicon.ico", "/assets/"],
});

// Lightweight health probe used by Docker HEALTHCHECK and validate.sh.
// We answer it directly (skip the React router) so the output is always
// pure JSON regardless of router/SSR state. It pings ClickHouse via the
// same env vars the rest of the dashboard uses.
async function healthz() {
  const url = process.env.CLICKHOUSE_URL
    ?? `http://${process.env.CLICKHOUSE_HOST ?? "clickhouse"}:${process.env.CLICKHOUSE_PORT ?? "8123"}`;
  const user = process.env.CLICKHOUSE_USER ?? "default";
  const pass = process.env.CLICKHOUSE_PASSWORD ?? "";
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  try {
    const res = await fetch(`${url}/?query=SELECT+1`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      return { ok: false, clickhouse: `http ${res.status}` };
    }
    return { ok: true, clickhouse: "reachable" };
  } catch {
    // Avoid leaking node-fetch error strings (DNS, ECONNREFUSED, etc.) when
    // the dashboard is reachable on the LAN — the healthz endpoint is
    // intentionally unauthenticated for Docker HEALTHCHECK + validate.sh,
    // so we keep the body to the boolean contract only.
    return { ok: false, clickhouse: "unreachable" };
  }
}

function toRequest(req) {
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const host = req.headers.host ?? `${HOST}:${PORT}`;
  const url = `${proto}://${host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((vv) => headers.append(k, vv));
    else headers.set(k, String(v));
  }
  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  return new Request(url, init);
}

// Serve static files from dist/client/. Returns true if a response was sent.
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLIENT_ROOT = resolve(__dirname, "dist", "client");

const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const path = (req.url || "/").split("?")[0].split("#")[0];
  // Only serve known static prefixes; everything else is SSR.
  if (
    !path.startsWith("/assets/") &&
    path !== "/favicon.svg" &&
    path !== "/favicon.ico"
  ) {
    return false;
  }
  // Path traversal guard.
  const safe = normalize(path).replace(/^\/+/, "");
  const full = join(CLIENT_ROOT, safe);
  if (!full.startsWith(CLIENT_ROOT + sep) && full !== CLIENT_ROOT) {
    res.statusCode = 403;
    res.end("Forbidden");
    return true;
  }
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return false; // file not found — let SSR handler render its 404
  }
  if (!stat.isFile()) return false;
  const ext = full.slice(full.lastIndexOf(".")).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("content-type", type);
  res.setHeader("content-length", stat.size);
  // Hashed Vite asset URLs are immutable; long-cache them.
  if (path.startsWith("/assets/")) {
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("cache-control", "public, max-age=3600");
  }
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  createReadStream(full).pipe(res);
  return true;
}

const server = createServer(async (req, res) => {
  try {
    // Run Basic Auth before everything else. The middleware ends the
    // response itself on 401; the writableEnded guard then short-circuits
    // the rest of the handler.
    await new Promise((resolve, reject) => {
      requireAuth(req, res, (err) => (err ? reject(err) : resolve()));
    });
    if (res.writableEnded) return;
    if (req.url === "/api/healthz" || req.url === "/api/healthz/") {
      const body = await healthz();
      res.statusCode = body.ok ? 200 : 503;
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(body));
      return;
    }
    // Serve static client assets directly from disk before delegating to the
    // SSR fetch handler. The TanStack Start handler does NOT serve files —
    // it only renders the React tree.
    if (serveStatic(req, res)) return;
    const response = await handler.fetch(toRequest(req));
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error("dashboard server error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "internal" }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[dashboard] listening on http://${HOST}:${PORT}`);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
