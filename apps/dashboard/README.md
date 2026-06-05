# Copilot Telemetry Dashboard

TanStack Start (React 19 + Vite 7) UI on top of the OTel → ClickHouse pipeline
defined in this repo. All queries run server-side via `createServerFn`; the
browser only receives shaped JSON.

## Layout

```text
app/
  routes/        # 13 file-based routes + /api/healthz
  components/
    ui/          # shadcn primitives (vendored)
    layout/      # AppShell, Sidebar, Header, FilterBar, RevealBanner, …
    charts/      # AreaStacked, Donut, Histogram, Heatmap, BarHorizontal, …
    data/        # KpiCard, RevealableCell, FormatCell, MetricGroup
  server/
    clickhouse.ts          # singleton client (server-only)
    bootstrap.ts           # idempotent CREATE-IF-NOT-EXISTS for the views
    pricing.ts             # USD per 1M tokens, per model
    filters.ts             # parameterized SQL fragments from URL filters
    queries/               # one file per route's data source
    reveal.ts              # createServerFn for redacted prompt content
  lib/                     # types (zod), format, colors, use-filters
  styles/globals.css       # Tailwind v4 + shadcn vars (light/dark)
```

## Environment variables

| name                  | default                         | purpose                              |
| --------------------- | ------------------------------- | ------------------------------------ |
| `CLICKHOUSE_URL`      | runtime-specific                | HTTP endpoint                        |
| `CLICKHOUSE_USER`     | `default`                       | basic auth user                      |
| `CLICKHOUSE_PASSWORD` | `""`                            | basic auth password                  |
| `CLICKHOUSE_DB`       | `copilot_telemetry`             | database name                        |
| `PORT`                | `3000`                          | bind port                            |
| `DASHBOARD_USER`      | `admin`                         | HTTP Basic Auth user                 |
| `DASHBOARD_PASSWORD`  | `admin`                         | HTTP Basic Auth password             |

All env vars are read **server-side only** — they never reach the bundle.

For local development, `pnpm --dir apps/dashboard dev` auto-loads the repo-root
`.env` before Vite middleware and server code read config. Precedence is:

1. explicit shell env
2. repo-root `.env`
3. hardcoded runtime defaults

If neither `CLICKHOUSE_URL` nor `CLICKHOUSE_HOST` is set, local dev falls back
to `http://127.0.0.1:8123`.

## Captured-content safety

Prompt and response bodies are stored under
`SpanAttributes['gen_ai.input.messages']` /
`SpanAttributes['gen_ai.output.messages']` only when the collector ran with
`COPILOT_OTEL_CAPTURE_CONTENT=true`. The dashboard never displays that data by
default. The `<RevealableCell />` component shows a `[redacted, click to
reveal]` placeholder; clicking it calls a per-span `createServerFn` that
returns the raw strings. The first reveal sets a `sessionStorage` flag (never
`localStorage`), and a `<RevealBanner />` appears at the top of every page
with a "Lock all" button that clears the flag.

## Local dev

Pre-req: docker compose stack (clickhouse + otel collector) running.

Local dev uses the same repo-root `.env` credentials and ClickHouse settings as
the Docker dashboard. Use the effective `.env` `DASHBOARD_USER` /
`DASHBOARD_PASSWORD` for `http://127.0.0.1:3000`; `admin/admin` only works if
you intentionally leave those values unchanged (or rely on the hardcoded
fallback).

```bash
bash scripts/dashboard-dev.sh
# or:
pnpm --dir apps/dashboard install
pnpm --dir apps/dashboard dev      # http://127.0.0.1:3000
```

Health check example:

```bash
curl -u '<dashboard-user>:<dashboard-password>' \
  http://127.0.0.1:3000/api/healthz
```

## Build & run (production)

```bash
pnpm install --frozen-lockfile
pnpm build
node .output/server/index.mjs
```

## Container

```bash
docker build -t ghcp-dashboard .
docker run --rm -p 3000:3000 \
  -e CLICKHOUSE_URL=http://clickhouse:8123 \
  ghcp-dashboard
```

The image runs as `node` (uid 1000), pins `node:22-alpine` by sha256 digest,
and ships a `HEALTHCHECK` that probes `/api/healthz`.

In the repo compose stack, the dashboard container is a built image, not a
live-mounted dev container. After dashboard code changes, rebuild it with:

```bash
docker compose up -d --build dashboard
```

## Routes

| path              | purpose                                                |
| ----------------- | ------------------------------------------------------ |
| `/`               | KPI cards: input / output / cache_read / cache_create / requests / sessions + cost |
| `/trends`         | Stacked area chart of token volume over time           |
| `/models`         | Bar + table; per-model usage and est. cost             |
| `/agents`         | Top-20 agents by token volume                          |
| `/calls`          | TanStack Table over `chat` spans (sortable, paginated) |
| `/sessions`       | Session rollups                                        |
| `/sessions/:id`   | Per-session turn-by-turn timeline                      |
| `/cache`          | Cache hit ratio + estimated savings                    |
| `/latency`        | Per-model p50 / p90 / p99                              |
| `/ttft`           | Time-to-first-token quantiles (or empty state)         |
| `/tools`          | Tool invocations: count, mean duration, error rate     |
| `/heatmap`        | DOW × HOD volume heatmap (color + label)               |
| `/finish`         | Donut + over-time stack of finish reasons              |
| `/api/healthz`    | ClickHouse reachability probe (consumed by Docker HC)  |

## Pricing snapshot

Cost estimates use a snapshot of
[BerriAI/litellm `model_prices_and_context_window.json`](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json)
committed at `apps/dashboard/app/server/data/litellm-prices.json`. Refresh
manually with `bash scripts/refresh-pricing.sh` (or `pnpm --dir apps/dashboard
refresh-pricing`). The refresh is **not** wired into `pnpm install` so that
offline installs and CI sandboxes never make outbound HTTP. Copilot-specific
overrides in `apps/dashboard/app/server/pricing.ts` always win over the
litellm row, followed by direct litellm matches and finally the Copilot →
upstream alias map.

## Cache hit rate

Defined as `cache_read / (cache_read + input)` over the chosen filter window
— the share of input-equivalent tokens served from prompt cache. Surfaced on
`/cache` next to the formula badge.
