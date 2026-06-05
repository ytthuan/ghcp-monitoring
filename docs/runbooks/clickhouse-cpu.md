# ClickHouse CPU triage and cleanup

> Status: active operations playbook.

Use this when the `clickhouse` container consumes high CPU while the dashboard
data volume is small or idle.

## What happened

ClickHouse can generate high-volume internal diagnostic logs in the `system`
database. These are not Copilot telemetry rows. In the observed failure, the
user-facing telemetry tables were small, but internal tables were huge:

- `system.trace_log`: hundreds of millions of rows.
- `system.asynchronous_metric_log`: hundreds of millions of rows.
- `system.text_log`: tens of millions of rows.
- `system.metric_log` / `system.query_log`: active background merge pressure.

That creates CPU load from background merges even when no dashboard query is
running.

## Low-CPU profile

The compose stack mounts:

```text
config/clickhouse-low-cpu.xml
config/clickhouse-users-low-cpu.xml
```

Those files disable high-volume ClickHouse self-diagnostic logs and the query
sampling profilers that write `system.trace_log`. They do not delete or disable
Copilot telemetry tables under `copilot_telemetry`.

Restart ClickHouse after config changes:

```bash
docker compose up -d clickhouse
```

## Inspect CPU and active work

```bash
docker stats --no-stream "$(docker compose ps -q clickhouse)"

docker compose exec -T clickhouse clickhouse-client --query "
SELECT elapsed, read_rows, memory_usage, left(replaceAll(query, '\n', ' '), 180)
FROM system.processes
WHERE query NOT LIKE '%system.processes%'
ORDER BY elapsed DESC
FORMAT PrettyCompact"

docker compose exec -T clickhouse clickhouse-client --query "
SELECT database, table, elapsed, num_parts, rows_read, rows_written
FROM system.merges
ORDER BY elapsed DESC
FORMAT PrettyCompact"
```

## Inspect user telemetry vs internal logs

User telemetry:

```bash
docker compose exec -T clickhouse clickhouse-client --query "
SELECT database, name, engine, total_rows, formatReadableSize(total_bytes) AS bytes
FROM system.tables
WHERE database = '${CLICKHOUSE_DB:-copilot_telemetry}'
ORDER BY total_bytes DESC
FORMAT PrettyCompact"
```

Internal ClickHouse logs:

```bash
docker compose exec -T clickhouse clickhouse-client --query "
SELECT table, active, count() AS parts, sum(rows) AS rows,
       formatReadableSize(sum(bytes_on_disk)) AS disk
FROM system.parts
WHERE database = 'system'
  AND table LIKE '%log'
GROUP BY table, active
ORDER BY disk DESC
FORMAT PrettyCompact"
```

## Cleanup internal logs

Run a dry run first:

```bash
bash scripts/cleanup-clickhouse-system-logs.sh
```

Then apply:

```bash
bash scripts/cleanup-clickhouse-system-logs.sh --apply
```

The script flushes logs and truncates an allowlist of `system.*_log` diagnostic
tables. It never truncates `copilot_telemetry.*`.

After cleanup, old parts may take a few minutes to disappear from disk. Measure
CPU after ClickHouse has restarted and the cleanup has settled:

```bash
docker compose restart clickhouse
sleep 30
docker stats --no-stream "$(docker compose ps -q clickhouse)"
```

## Validate the profile is active

```bash
docker compose exec -T clickhouse clickhouse-client --query "
SELECT name, value, changed
FROM system.settings
WHERE name IN (
  'query_profiler_real_time_period_ns',
  'query_profiler_cpu_time_period_ns',
  'memory_profiler_step',
  'log_queries',
  'log_query_threads',
  'log_query_views'
)
ORDER BY name
FORMAT PrettyCompact"
```

Expected: profiler periods and `memory_profiler_step` are `0`, and query log
settings are `0`.

## Fallback if CPU stays high

If CPU stays high after the low-CPU profile and cleanup:

1. Keep trace ingestion first; it powers token, cost, call, and session views.
2. Gate ClickHouse metrics/log ingestion behind an opt-in collector profile.
3. If ClickHouse is still too heavy for the machine, replace it with a lighter
   SQLite or DuckDB aggregate store and supersede ADR-0005.
