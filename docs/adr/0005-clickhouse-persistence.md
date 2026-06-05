# ADR-0005: ClickHouse as the single persistent OLAP store

- Status: accepted
- Date: 2026-05-14
- Owners: `@architecture-reviewer` + `@otel-collector-engineer` + `@dashboard-engineer`

## Context

The previous viewers — Aspire Dashboard and Jaeger — were both in-memory:
every restart erased traces, metrics, and logs. The user's needs go beyond
"see what's happening right now":

- Trending across days/weeks (token usage, cost, cache hit rate).
- Per-call sortable analysis (input/output/cache tokens, latency, TTFT,
  finish reasons) by model, agent, session, tool, time-of-day.
- Persistent KPIs that survive `docker compose down`.

We need one persistent store that can accept all three OTel signals and
answer dashboard queries with sub-100 ms latency.

## Decision

Adopt **ClickHouse** as the sole persistent OLAP store for traces,
metrics, and logs. The OpenTelemetry Collector contrib distribution
writes to it via the `clickhouse` exporter, which auto-creates the
canonical tables on first start:

- `otel_traces` — one row per span. `SpanAttributes` is a
  `Map(LowCardinality(String), String)` so GenAI attributes are accessed
  as `SpanAttributes['gen_ai.usage.input_tokens']`, etc.
- `otel_logs` — one row per log/event (e.g.
  `gen_ai.client.inference.operation.details`).
- `otel_metrics_sum` / `_gauge` / `_histogram` /
  `_exponential_histogram` / `_summary` — one table per metric type.

Five materialized views accelerate the hot dashboard panels:

- `mv_call_totals` — running sums (input, output, cache_read,
  cache_create, calls).
- `mv_call_by_minute` — per-minute aggregates for trend charts.
- `mv_call_by_hour` — per-hour-of-week for the heatmap.
- `mv_calls_by_model` — per-model rollups (cardinality bounded).
- `mv_calls_by_agent` — per-agent rollups.

Each MV uses `SummingMergeTree` / `AggregatingMergeTree` with explicit
TTL. Default retention is 90 days, configurable via `.env`
(`CLICKHOUSE_TTL_DAYS`). Bounded retention is a Security & Audit Matrix
gate.

ClickHouse runs containerized with **no host port** — only
`expose:` on the docker network. The default user gets a strong
password from `.env` (`CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`,
`CLICKHOUSE_DB`); `.env.example` carries placeholders only. The
dashboard service reaches it on the docker network via the
`@clickhouse/client` library running inside server functions.

## Consequences

### Positive

- One SQL surface for every signal — no per-backend dialect.
- Sub-100 ms aggregations on millions of rows via materialized views.
- Persistent across container restarts and host reboots.
- Columnar compression keeps disk footprint modest, even with full
  span attributes retained.
- Plays cleanly with the existing single-ingress collector (ADR-0001)
  and edge-only redaction pattern (ADR-0003).

### Negative / risks

- The `clickhouse` exporter is `alpha` for metrics (`beta` for traces
  and logs). Mitigated by relying on it as a write target only — the
  dashboard reads tables directly. If a metric arrives malformed,
  `otel_traces` remains authoritative for GenAI token data.
- One store = one failure domain. Acceptable for a local-first stack
  (ADR-0002); revisit if scope grows beyond a single host.
- Strong-password posture is enforced operationally, not by the engine
  default — `@security-auditor` audits `.env.example` and the compose
  service definition.
- Schema is owned by the exporter; column renames between exporter
  versions can break the materialized views. Mitigation: pin the
  collector image digest and re-run the MV init SQL on upgrade.

## Alternatives considered

- **Prometheus + Tempo split.** Rejected — separate stores for
  metrics and traces force dual queries from the dashboard, complicate
  per-call token analytics (Prometheus is not built for high-cardinality
  per-call rows), and double the operational surface.
- **SQLite + a custom OTLP ingest.** Rejected — minimalist but loses
  SQL flexibility at scale; would also require maintaining a bespoke
  ingest path instead of the contrib `clickhouse` exporter.
- **Keep Aspire and Jaeger as-is.** Rejected — no persistence; cannot
  satisfy trending or per-call analysis (the original problem).

## References

- ClickHouse exporter (OTel contrib) — <https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/clickhouseexporter>
- Plan — `plan.md` § "Data model — ClickHouse via OTel exporter"
- ADR-0001 — OTel Collector as single ingress (upstream)
- ADR-0002 — Compose-based local-first deployment
- ADR-0003 — Attribute redaction strategy
- ADR-0006 — TanStack Start dashboard (downstream consumer)
