# Copilot monitoring stack

## Overview

This folder documents the local Docker Compose stack for Copilot OpenTelemetry
signals. Copilot sends OTLP to the collector, the collector strips known auth
headers, and every signal is written to a persistent **ClickHouse** OLAP store.
A custom **TanStack Start dashboard** binds to `http://127.0.0.1:6969` and
renders 13 purpose-built panels for token usage, latency, sessions, tools, and
cost. See ADR-0005 and ADR-0006.

## Start

```bash
cp .env.example .env
# edit .env to set a strong CLICKHOUSE_PASSWORD (placeholder will not work)
docker compose up -d
```

## UIs

| UI | URL | What you see |
|---|---|---|
| **Copilot Telemetry Dashboard** (TanStack Start) | <http://127.0.0.1:6969> | 13 panels backed by ClickHouse: Totals, Trends, By Model, By Agent, Per-call table, Sessions (list + detail), Cache efficiency, Latency, Time-to-first-token, Tool calls, Hourly heatmap, Finish reasons. Filter bar (date range, model, agent) is global and reflected in URL search params. |

### Dashboard access (Basic Auth)

The dashboard requires HTTP Basic Auth. The effective credentials come from the
repo-root `.env` via `DASHBOARD_USER` / `DASHBOARD_PASSWORD`, and those same
values apply to both the production container (`:6969`) and local dashboard dev
(`pnpm --dir apps/dashboard dev` on `:3000`). `admin` / `admin` is only valid
when you intentionally leave that example value in `.env` or rely on the
hardcoded fallback.

To rotate, edit `DASHBOARD_USER` / `DASHBOARD_PASSWORD` in `.env`, then
restart local dev if needed and rebuild the container with:

```bash
docker compose up -d --build dashboard
```

Open the dashboard in a **private window** afterwards — browsers cache 401
responses and credentials for the lifetime of the tab, so an existing tab will
keep using the old password.

Auth is plaintext over HTTP. That is acceptable for the loopback-only
deployment defined in ADR-0004 (`127.0.0.1:6969` only), but **do not** expose
the dashboard on a public network without first putting a TLS-terminating
reverse proxy in front of it. `/api/healthz` and the favicons are exempt from
auth so Docker's HEALTHCHECK and `scripts/validate.sh` keep working.

The dashboard's panel surface in detail:

| Route | Panel | Shows |
|---|---|---|
| `/` | Totals | KPI cards: Σ input, Σ output, Σ cache_read, Σ cache_create, requests, sessions, est. $ |
| `/trends` | Trend | Stacked area of input/output/cache tokens over time (5m/1h/1d granularity) |
| `/models` | By Model | Request vs response model, token breakdown, share of spend |
| `/agents` | By Agent | `gen_ai.agent.name` + `agent.id`, token + call count |
| `/calls` | Per-call table | Sortable/filterable rows: ts, model, in, out, cache_r, cache_c, latency_ms, ttft_ms, agent, conv, finish, est. $ |
| `/sessions`, `/sessions/$id` | Sessions | List of `copilot_chat.chat_session_id` rollups; detail page shows turn-by-turn timeline |
| `/cache` | Cache efficiency | Cache hit ratio (`cache_read / (cache_read + input)`) and savings $ |
| `/latency` | Latency | Duration histogram per model, p50/p90/p99 lines + raw scatter |
| `/ttft` | Time-to-first-token | Per-model TTFT distribution (`gen_ai.server.time_to_first_token`) |
| `/tools` | Tool calls | `gen_ai.tool.name` frequency, duration, failure rate |
| `/heatmap` | Hourly heatmap | Day-of-week × hour-of-day, color **and** numeric label per cell (WCAG-friendly) |
| `/finish` | Finish reasons | Donut + over-time stacked area (stop / length / tool_calls / content_filter) |

Billable token and cost rollups use `chat` spans as the source of truth. The
dashboard still ingests `invoke_agent` spans for agent/session analysis, but
those wrappers can repeat child chat token counts and are not added again to the
overview token/cost KPIs.

## Collector endpoints

The collector listens on:

| Endpoint | Purpose |
|---|---|
| `http://127.0.0.1:4318` | OTLP HTTP (Copilot CLI requires HTTP) |
| `127.0.0.1:4317` | OTLP gRPC (VS Code Copilot Chat default) |
| `http://127.0.0.1:13133` | Collector health check |

## Configure Copilot

For VS Code Copilot Chat settings:

```json
{
  "github.copilot.chat.otel.enabled": true,
  "github.copilot.chat.otel.exporterType": "otlp-grpc",
  "github.copilot.chat.otel.otlpEndpoint": "http://127.0.0.1:4317",
  "github.copilot.chat.otel.captureContent": false
}
```

For Copilot CLI terminal sessions on macOS/Linux Bash, Zsh, or Git Bash:

```bash
source scripts/setup-terminal.sh
```

For Windows PowerShell:

```powershell
.\scripts\setup-terminal.ps1
```

The setup script exports `COPILOT_OTEL_ENABLED=true`,
`COPILOT_OTEL_CAPTURE_CONTENT=false`,
`OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`, and
`OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`. Use the OTLP HTTP endpoint for
Copilot CLI terminal sessions. The upstream monitoring docs note that the
terminal CLI path supports OTLP HTTP, not a gRPC-only backend.

> **Note.** VS Code Copilot Chat's default exporter is **gRPC on `4317`**;
> the Copilot CLI requires **HTTP on `4318`**. The collector listens on both,
> so you can mix them. Re-run the terminal setup helper after every shell
> restart - `.env` does not affect already-open shells.

## Persistence

Telemetry now survives restarts. ClickHouse stores traces, logs, and metrics
on the named docker volume `clickhouse-data`. The volume is not bound to any
host path; remove it explicitly with `docker volume rm` if you want to wipe
history.

Retention is bounded by the `RETENTION_DAYS` variable in `.env` (default
`90`). The bound is enforced two ways:

- **TTL on materialized views** (`config/clickhouse-init.sql`) drops aggregate
  rows older than `RETENTION_DAYS`.
- **OTel `clickhouse` exporter `ttl` setting** drops raw rows in `otel_traces`,
  `otel_logs`, and the `otel_metrics_*` tables on the same window.

Lower `RETENTION_DAYS` for a tighter privacy posture; raise it if you need
longer trend history (and have the disk for it). Bounded retention is a
Security & Audit Matrix gate — do not remove the TTLs.

ClickHouse also runs with a local low-CPU profile that disables high-volume
internal diagnostic logs and profilers while preserving `copilot_telemetry.*`
data. If the container shows high idle CPU, use
[`docs/runbooks/clickhouse-cpu.md`](../runbooks/clickhouse-cpu.md) before
considering a storage replacement.

## What the collector ingests

The collector accepts the **full** signal set described in the
[upstream monitoring guide](https://github.com/microsoft/vscode-copilot-chat/blob/main/docs/monitoring/agent_monitoring.md):

- **Traces** — `invoke_agent`, `chat`, and `execute_tool` spans with all GenAI
  semantic-convention attributes (model, tokens, durations, finish reasons,
  conversation id, time-to-first-token, etc.).
- **Metrics** — `gen_ai.client.operation.duration`, `gen_ai.client.token.usage`,
  plus the `copilot_chat.*` family (tool call count/duration, agent invocation,
  edit acceptance/survival, lines of code, user feedback, cloud sessions, …).
- **Logs / events** — `gen_ai.client.inference.operation.details`,
  `copilot_chat.session.start`, `copilot_chat.tool.call`,
  `copilot_chat.edit.feedback`, `copilot_chat.edit.survival`, etc.

All three signals are now written to ClickHouse (instead of Aspire), and the
dashboard correlates them via SQL on `SpanAttributes['gen_ai.*']`. The
collector also keeps a `debug/metadata` exporter so `docker compose logs
otel-collector` still proves ingress is healthy without logging payloads.

## Captured-content safety

Prompts, responses, system instructions, tool arguments, and tool results are
**not** emitted by Copilot unless you explicitly opt in:

```json
{ "github.copilot.chat.otel.captureContent": true }
```

or

```bash
export COPILOT_OTEL_CAPTURE_CONTENT=true
```

Keep `COPILOT_OTEL_CAPTURE_CONTENT=false` unless you are in a trusted, scoped
debugging session. Content capture can include prompts, generated responses,
tool arguments, code, file paths, and secrets.

When captured content is present in ClickHouse, the dashboard's default visual
state shows a `[redacted]` placeholder so a shoulder-surfer cannot read prompts
at a glance. To see a row in the clear:

- Click the per-row **Reveal** toggle in any content cell.
- A persistent **banner** appears at the top of any table where reveal is
  active.
- The reveal flag is stored in `sessionStorage` only — it never leaves the tab
  and never persists across browser restarts.

The collector does **not** double-redact captured content by default — it
forwards whatever the client chose to emit. If you want belt-and-suspenders
redaction at the collector (required before adding any remote exporter), wire
the pre-defined `attributes/redact-content` processor into the active
pipelines in
[`config/otelcol-copilot.yaml`](../../config/otelcol-copilot.yaml):

```yaml
service:
  pipelines:
    traces:
      processors:
        - memory_limiter
        - attributes/scrub-auth
        - attributes/redact-content   # add this line
        - resourcedetection
        - resource/collector
        - batch
```

Do not add a cloud exporter such as Azure Monitor to the default pipeline
without an explicit opt-in path. If you add one later, wire
`attributes/redact-content` upstream of every cloud exporter and store real
connection strings only in untracked `.env` files or a secret manager.

## Differences from the upstream sample

The upstream `docs/monitoring/docker-compose.yaml` is a useful demo, but this
repo uses safer defaults for a local development stack:

- **Persistent ClickHouse** replaces the in-memory Aspire Dashboard / Jaeger
  pair. Telemetry survives restarts; retention is bounded by `RETENTION_DAYS`.
- **ClickHouse is not exposed on the host** — only `expose:` for the docker
  network. The dashboard talks to it on the internal network.
- **A strong `CLICKHOUSE_PASSWORD` is required in `.env`.** The placeholder in
  `.env.example` is intentionally invalid; the stack will refuse to start with
  a blank password.
- **The dashboard binds to `127.0.0.1:6969` only** (loopback). It is never
  exposed on a public interface.
- Images are version and **digest pinned** instead of using `latest`
  (collector, ClickHouse, Node base for the dashboard).
- Published ports bind to `127.0.0.1`, not every host interface.
- Azure Monitor export is not enabled by default, so telemetry stays local.
- Auth headers, proxy-auth headers, cookies, set-cookie headers, and full URLs
  are deleted in the collector before any exporter runs.
- Container logs are size-limited because even metadata can be sensitive.

## Validate

```bash
docker compose config -q
bash scripts/validate.sh all
```

After the stack is running, confirm terminal ingest with:

```bash
bash scripts/validate.sh connectivity
docker compose logs --since 1m otel-collector | grep 'Traces'
```

`scripts/validate.sh connectivity` posts an OTLP HTTP smoke trace, polls the
configured ClickHouse database for that trace, probes ClickHouse `/ping`, and
checks the dashboard health/root endpoints. A green run proves the local
receive -> export -> persist -> render path is up.

When security tools are installed, also run:

```bash
gitleaks detect --no-banner
trivy fs .
```

## Troubleshooting terminal telemetry

The dashboard **Refresh data** button refetches dashboard queries from
ClickHouse. It does not flush, replay, or trigger OTel ingestion. If data does
not appear after refresh, separate the problem into ingestion, persistence, and
dashboard-query layers.

First re-source the terminal setup script:

```bash
source scripts/setup-terminal.sh
env | grep -E '^(COPILOT_OTEL|OTEL_EXPORTER_OTLP|OTEL_SERVICE_NAME)'
```

Expected terminal values:

| Variable | Expected value |
|---|---|
| `COPILOT_OTEL_ENABLED` | `true` |
| `COPILOT_OTEL_CAPTURE_CONTENT` | `false` unless explicitly debugging content in a trusted session |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://127.0.0.1:4318` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` |
| `OTEL_SERVICE_NAME` | `github-copilot` unless intentionally overridden |

Common causes:

- `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317` points the terminal CLI at
  the collector's gRPC port. Use `http://127.0.0.1:4318` for OTLP HTTP.
- `OTEL_EXPORTER_OTLP_PROTOCOL` is unset. Set it to `http/protobuf`.
- `.env` was copied for Docker Compose, but the terminal shell was never
  configured. `.env` does not change already-open shells.
- The stack is not running or the collector is unhealthy. Run
   `docker compose up -d` and then `bash scripts/validate.sh connectivity`.
- **If the dashboard says "no data yet"**, check that `docker compose ps`
   reports `clickhouse` as `healthy` and that you have actually sent a Copilot
   message since the last `docker compose up`. Empty-state is correct on a
   fresh stack — `/calls` will populate within a few seconds of the first
   request.

To inspect ClickHouse manually, always query the configured database and user.
Running `clickhouse-client` without these flags checks the `default` database,
which can falsely look empty:

```bash
docker compose exec -T clickhouse sh -c \
  'clickhouse-client --multiquery --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" --query "
    SELECT count() AS spans, max(Timestamp) AS newest
    FROM otel_traces
    FORMAT TSVWithNames"'
```

If spans exist but the dashboard refresh fails, inspect recent ClickHouse query
errors:

```bash
docker compose exec -T clickhouse sh -c \
  'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" --query "
    SYSTEM FLUSH LOGS;
    SELECT event_time, exception_code, left(query, 400) AS query
    FROM system.query_log
    WHERE event_time >= now() - INTERVAL 20 MINUTE
      AND exception_code != 0
    ORDER BY event_time DESC
    LIMIT 10
    FORMAT TSVWithNames"'
```

The dashboard maintains a slim `ghcp_dashboard_spans` projection for normal
analytics panels. Raw `otel_traces` remains the source of truth for trace detail
and revealable captured content.

The collector exports trace metadata to its own logs, so a successful terminal
trace should produce a `Traces` line in `docker compose logs otel-collector`
without logging prompt or code content.

## Architecture decisions

- [ADR-0005 — ClickHouse persistence](../adr/0005-clickhouse-persistence.md)
- [ADR-0006 — TanStack Start dashboard](../adr/0006-tanstack-dashboard.md)
