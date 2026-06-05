/**
 * Logs page server-fns:
 *
 *   - `getIngestionHealth()` returns per-table row counts (5m / 1h / 24h),
 *     newest-row freshness, a 60-minute traces/logs/metrics sparkline, and
 *     (best-effort) collector self-metrics. Used by /logs to confirm the OTel
 *     pipeline is flowing.
 *   - `getLogs()` paginates `otel_logs` with optional case-insensitive body
 *     search and the global filter-bar time range.
 *
 * Ingestion truth comes from ClickHouse counts — collector self-metrics are
 * informational only and degrade gracefully when not exported.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FiltersSchema, type Filters } from "../../lib/types";

// ─── Types ────────────────────────────────────────────────────────────────

export interface IngestionTableStats {
  name: string;
  rows_5m: number;
  rows_1h: number;
  rows_24h: number;
  /** ISO-8601 UTC timestamp (trailing Z), or null if no rows in last 24h. */
  latest_event_at: string | null;
  seconds_since_latest: number | null;
}

export interface SparklinePoint {
  /** ISO-8601 UTC bucket start (trailing Z). */
  minute: string;
  traces: number;
  logs: number;
  /** Sum across all otel_metrics_* tables for the bucket. */
  metrics: number;
}

export type CollectorStats =
  | { available: false; reason: "not_exported" }
  | { available: true; sent_spans_per_min: number; failed_spans_per_min: number };

export interface IngestionHealth {
  tables: IngestionTableStats[];
  sparkline: SparklinePoint[];
  collector: CollectorStats;
  /** Server's "now" (ISO UTC) — drives the "as of" caption. */
  fetchedAt: string;
}

export interface LogRow {
  timestamp: string;
  trace_id: string;
  span_id: string;
  severity: string;
  service_name: string;
  body: string;
  log_attributes: Record<string, string>;
  resource_attributes: Record<string, string>;
}

export interface LogsPage {
  rows: LogRow[];
  total: number;
}

const LogSeveritySchema = z.enum([
  "TRACE",
  "DEBUG",
  "INFO",
  "WARN",
  "ERROR",
  "FATAL",
]);
export type LogSeverity = z.infer<typeof LogSeveritySchema>;

const LogSortColumnSchema = z.enum([
  "timestamp",
  "severity",
  "service_name",
]);
export type LogSortColumn = z.infer<typeof LogSortColumnSchema>;

type LogSortDir = "asc" | "desc";

const LOG_SORT_SQL: Record<LogSortColumn, (dir: LogSortDir) => string> = {
  timestamp: (dir) => `Timestamp ${dir.toUpperCase()}`,
  severity: (dir) =>
    `SeverityNumber ${dir.toUpperCase()}, SeverityText ${dir.toUpperCase()}, Timestamp DESC`,
  service_name: (dir) => `ServiceName ${dir.toUpperCase()}, Timestamp DESC`,
};

// ─── Helpers ──────────────────────────────────────────────────────────────

const INGESTION_TABLES = [
  "otel_traces",
  "otel_logs",
  "otel_metrics_sum",
  "otel_metrics_histogram",
  "otel_metrics_gauge",
  "otel_metrics_summary",
  "otel_metrics_exponential_histogram",
] as const;

/** otel_metrics_* tables use TimeUnix; otel_traces/otel_logs use Timestamp. */
function tsColumnFor(table: string): string {
  return table.startsWith("otel_metrics_") ? "TimeUnix" : "Timestamp";
}

/** ClickHouse `YYYY-MM-DD HH:MM:SS[.fff]` → ISO Z, or null on sentinel/empty. */
function chToIso(s: string | null | undefined): string | null {
  if (!s) return null;
  if (s.startsWith("1970-01-01")) return null;
  return new Date(s.replace(" ", "T") + "Z").toISOString();
}

const RANGE_TO_SECONDS: Record<string, number> = {
  "1h": 3_600,
  "6h": 21_600,
  "24h": 86_400,
  "7d": 604_800,
  "30d": 2_592_000,
};

/**
 * Time-only WHERE for `otel_logs`. The shared `buildWhere` is span-attribute
 * heavy and not appropriate here — logs only filter by the global range.
 */
function buildLogsTimeWhere(filters: Filters): {
  where: string;
  params: Record<string, unknown>;
} {
  if (filters.range === "custom" && filters.from && filters.to) {
    return {
      where:
        "AND Timestamp BETWEEN parseDateTime64BestEffort({from:String}) AND parseDateTime64BestEffort({to:String})",
      params: { from: filters.from, to: filters.to },
    };
  }
  const seconds = RANGE_TO_SECONDS[filters.range] ?? RANGE_TO_SECONDS["24h"]!;
  return {
    where: "AND Timestamp >= now() - INTERVAL {seconds:UInt32} SECOND",
    params: { seconds },
  };
}

// ─── getIngestionHealth ───────────────────────────────────────────────────

interface RawTableStats {
  rows_5m: string | number;
  rows_1h: string | number;
  rows_24h: string | number;
  latest_event_at: string;
  seconds_since_latest: string | number;
}

async function fetchTableStats(
  table: string,
): Promise<IngestionTableStats> {
  const { query } = await import("../clickhouse");
  const ts = tsColumnFor(table);
  const sql = `
    SELECT
      toUInt64(countIf(${ts} >= now() - INTERVAL 5  MINUTE)) AS rows_5m,
      toUInt64(countIf(${ts} >= now() - INTERVAL 1  HOUR))   AS rows_1h,
      toUInt64(countIf(${ts} >= now() - INTERVAL 24 HOUR))   AS rows_24h,
      toString(max(${ts}))                                   AS latest_event_at,
      toUInt32(if(max(${ts}) > toDateTime(0),
                  dateDiff('second', max(${ts}), now()),
                  0))                                        AS seconds_since_latest
    FROM ${table}
    PREWHERE ${ts} >= now() - INTERVAL 24 HOUR
  `;
  try {
    const rows = await query<RawTableStats>(sql);
    const r = rows[0];
    if (!r) {
      return {
        name: table,
        rows_5m: 0,
        rows_1h: 0,
        rows_24h: 0,
        latest_event_at: null,
        seconds_since_latest: null,
      };
    }
    const latest = chToIso(r.latest_event_at);
    return {
      name: table,
      rows_5m: Number(r.rows_5m ?? 0),
      rows_1h: Number(r.rows_1h ?? 0),
      rows_24h: Number(r.rows_24h ?? 0),
      latest_event_at: latest,
      seconds_since_latest: latest == null ? null : Number(r.seconds_since_latest ?? 0),
    };
  } catch {
    // Table missing or transient CH error — surface as zeros so the rest of
    // the dashboard stays useful.
    return {
      name: table,
      rows_5m: 0,
      rows_1h: 0,
      rows_24h: 0,
      latest_event_at: null,
      seconds_since_latest: null,
    };
  }
}

interface MinuteCount {
  m: string;
  c: string | number;
}

/** Bucketed counts for one table; merged JS-side into a 60-minute sparkline. */
async function fetchMinuteSeries(
  table: string,
): Promise<Map<string, number>> {
  const { query } = await import("../clickhouse");
  const ts = tsColumnFor(table);
  const sql = `
    SELECT toString(toStartOfMinute(${ts})) AS m, count() AS c
    FROM ${table}
    WHERE ${ts} >= now() - INTERVAL 60 MINUTE
    GROUP BY m
    ORDER BY m ASC
  `;
  try {
    const rows = await query<MinuteCount>(sql);
    const out = new Map<string, number>();
    for (const r of rows) out.set(String(r.m), Number(r.c ?? 0));
    return out;
  } catch {
    return new Map();
  }
}

async function fetchSparkline(): Promise<SparklinePoint[]> {
  const { query } = await import("../clickhouse");

  // Build the 60 minute buckets from the server (so the JS clock is irrelevant).
  const minutesRows = await query<{ m: string }>(`
    SELECT toString(arrayJoin(arrayMap(
      i -> toStartOfMinute(now()) - toIntervalMinute(i),
      range(60)
    ))) AS m
    ORDER BY m ASC
  `);
  const minutes = minutesRows.map((r) => String(r.m));

  const [traces, logs, mSum, mHist, mGauge, mSummary, mExp] = await Promise.all([
    fetchMinuteSeries("otel_traces"),
    fetchMinuteSeries("otel_logs"),
    fetchMinuteSeries("otel_metrics_sum"),
    fetchMinuteSeries("otel_metrics_histogram"),
    fetchMinuteSeries("otel_metrics_gauge"),
    fetchMinuteSeries("otel_metrics_summary"),
    fetchMinuteSeries("otel_metrics_exponential_histogram"),
  ]);

  return minutes.map<SparklinePoint>((m) => ({
    minute: new Date(m.replace(" ", "T") + "Z").toISOString(),
    traces: traces.get(m) ?? 0,
    logs: logs.get(m) ?? 0,
    metrics:
      (mSum.get(m) ?? 0) +
      (mHist.get(m) ?? 0) +
      (mGauge.get(m) ?? 0) +
      (mSummary.get(m) ?? 0) +
      (mExp.get(m) ?? 0),
  }));
}

async function fetchCollector(): Promise<CollectorStats> {
  const { query } = await import("../clickhouse");
  try {
    const probe = await query<{ probe: string | null }>(`
      SELECT any(MetricName) AS probe
      FROM otel_metrics_sum
      WHERE MetricName LIKE 'otelcol_exporter_%'
        AND TimeUnix >= now() - INTERVAL 5 MINUTE
      LIMIT 1
    `);
    if (!probe[0]?.probe) {
      return { available: false, reason: "not_exported" };
    }
    const rows = await query<{
      sent_per_min: string | number;
      failed_per_min: string | number;
    }>(`
      SELECT
        toFloat64(sumIf(Value, MetricName='otelcol_exporter_sent_spans')        / 5) AS sent_per_min,
        toFloat64(sumIf(Value, MetricName='otelcol_exporter_send_failed_spans') / 5) AS failed_per_min
      FROM otel_metrics_sum
      WHERE MetricName IN ('otelcol_exporter_sent_spans','otelcol_exporter_send_failed_spans')
        AND TimeUnix >= now() - INTERVAL 5 MINUTE
    `);
    const r = rows[0];
    return {
      available: true,
      sent_spans_per_min: Number(r?.sent_per_min ?? 0),
      failed_spans_per_min: Number(r?.failed_per_min ?? 0),
    };
  } catch {
    return { available: false, reason: "not_exported" };
  }
}

export const getIngestionHealth = createServerFn({ method: "GET" }).handler(
  async (): Promise<IngestionHealth> => {
    const [tables, sparkline, collector] = await Promise.all([
      Promise.all(INGESTION_TABLES.map((t) => fetchTableStats(t))),
      fetchSparkline(),
      fetchCollector(),
    ]);
    return {
      tables,
      sparkline,
      collector,
      fetchedAt: new Date().toISOString(),
    };
  },
);

// ─── getLogs ──────────────────────────────────────────────────────────────

const LogsArgsSchema = z.object({
  filters: FiltersSchema,
  search: z.string().max(200).default(""),
  severities: z.array(LogSeveritySchema).default([]),
  pageIndex: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(200).default(50),
  sortBy: LogSortColumnSchema.default("timestamp"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type LogsArgs = z.infer<typeof LogsArgsSchema>;

interface RawLogRow {
  timestamp: string;
  trace_id: string;
  span_id: string;
  severity: string;
  service_name: string;
  body: string;
  log_attributes: Record<string, string> | Array<[string, string]>;
  resource_attributes: Record<string, string> | Array<[string, string]>;
}

function normalizeMap(
  v: Record<string, string> | Array<[string, string]> | null | undefined,
): Record<string, string> {
  if (!v) return {};
  if (Array.isArray(v)) {
    const out: Record<string, string> = {};
    for (const entry of v) {
      if (Array.isArray(entry) && entry.length === 2) {
        out[String(entry[0])] = String(entry[1] ?? "");
      }
    }
    return out;
  }
  return v;
}

export const getLogs = createServerFn({ method: "POST" })
  .inputValidator((d: LogsArgs) => LogsArgsSchema.parse(d))
  .handler(async ({ data }): Promise<LogsPage> => {
    const { query } = await import("../clickhouse");
    const limit = Math.min(Math.max(data.pageSize, 1), 200);
    const offset = Math.max(data.pageIndex, 0) * limit;
    const { where: timeWhere, params: timeParams } = buildLogsTimeWhere(
      data.filters as Filters,
    );

    const params = {
      ...timeParams,
      search: data.search ?? "",
      limit,
      offset,
    } as Record<string, unknown>;
    const severities = (data.severities ?? []).map((s) => s.toUpperCase());
    const severityWhere =
      severities.length > 0
        ? `AND upper(SeverityText) IN (${severities
            .map((_, i) => `{severity${i}:String}`)
            .join(", ")})`
        : "";
    severities.forEach((severity, i) => {
      params[`severity${i}`] = severity;
    });
    const sortBy = data.sortBy ?? "timestamp";
    const sortDir = data.sortDir ?? "desc";
    const orderBy = LOG_SORT_SQL[sortBy](sortDir);

    const baseFilter = `
      WHERE 1=1
        ${timeWhere}
        AND (length({search:String}) = 0
             OR positionCaseInsensitive(Body, {search:String}) > 0)
        ${severityWhere}
    `;

    const countSql = `SELECT count() AS c FROM otel_logs ${baseFilter}`;
    const sql = `
      SELECT
        formatDateTime(Timestamp, '%Y-%m-%dT%H:%i:%SZ') AS timestamp,
        TraceId            AS trace_id,
        SpanId             AS span_id,
        SeverityText       AS severity,
        ServiceName        AS service_name,
        Body               AS body,
        LogAttributes      AS log_attributes,
        ResourceAttributes AS resource_attributes
      FROM otel_logs
      ${baseFilter}
      ORDER BY ${orderBy}
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    `;

    const [countRows, rows] = await Promise.all([
      query<{ c: string | number }>(countSql, params),
      query<RawLogRow>(sql, params),
    ]);

    return {
      total: Number(countRows[0]?.c ?? 0),
      rows: rows.map((r) => ({
        timestamp: String(r.timestamp ?? ""),
        trace_id: String(r.trace_id ?? ""),
        span_id: String(r.span_id ?? ""),
        severity: String(r.severity ?? ""),
        service_name: String(r.service_name ?? ""),
        body: String(r.body ?? ""),
        log_attributes: normalizeMap(r.log_attributes),
        resource_attributes: normalizeMap(r.resource_attributes),
      })),
    };
  });
