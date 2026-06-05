/**
 * Trace-list and trace-tree queries against `otel_traces`.
 *
 * Bigint correctness: nanosecond timestamps and durations are returned as
 * strings (toString(...)) so JS code can wrap them in BigInt for ratio math
 * without losing precision around 2^53.
 */
import { query } from "../clickhouse";
import { buildProjectionWhere } from "../filters";
import {
  DASHBOARD_SPANS_TABLE,
  queryDashboardSpans,
} from "./span_projection";
import type { Filters } from "../../lib/types";

export interface TraceRow {
  trace_id: string;
  root_name: string;
  root_service: string;
  root_present: boolean;
  /** ISO with trailing Z. */
  started_at: string;
  /** Bigint serialized as string to avoid Number overflow. */
  duration_ns: string;
  span_count: number;
  errors: number;
  input: number;
  output: number;
}

export interface SpanRow {
  span_id: string;
  parent_span_id: string;
  trace_id: string;
  span_name: string;
  service_name: string;
  span_kind: string;
  /** Nanoseconds since epoch as string. */
  started_at_ns: string;
  /** Nanoseconds as string. */
  duration_ns: string;
  status_code: string;
  status_message: string;
  attributes: Record<string, string>;
  resource: Record<string, string>;
  events: Array<{
    ts: string;
    name: string;
    attrs: Record<string, string>;
  }>;
}

export interface TraceTreeResult {
  spans: SpanRow[];
  truncated: boolean;
  root_present: boolean;
}

export interface TracesArgs {
  filters: Filters;
  pageIndex: number;
  pageSize: number;
  sortBy?: TraceSortColumn;
  sortDir?: "asc" | "desc";
}

export type TraceSortColumn =
  | "started_at"
  | "root_name"
  | "root_service"
  | "duration_ms"
  | "span_count"
  | "errors"
  | "input"
  | "output";

const SORTABLE: Record<TraceSortColumn, string> = {
  started_at: "start_ns",
  root_name: "root_name",
  root_service: "root_service",
  duration_ms: "end_ns - start_ns",
  span_count: "span_count",
  errors: "errors",
  input: "input",
  output: "output",
};

export async function getTraces(
  args: TracesArgs,
): Promise<{ rows: TraceRow[]; total: number }> {
  const { where, params } = buildProjectionWhere(args.filters);
  const limit = Math.min(Math.max(args.pageSize, 1), 200);
  const offset = Math.max(args.pageIndex, 0) * limit;
  const sortCol = SORTABLE[args.sortBy ?? "started_at"] ?? "start_ns";
  const dir = args.sortDir === "asc" ? "ASC" : "DESC";

  const countRows = await queryDashboardSpans<{ c: string | number }>(
    `SELECT count(distinct trace_id) AS c FROM ${DASHBOARD_SPANS_TABLE} ${where}`,
    params,
  );
  const total = Number(countRows[0]?.c ?? 0);

  const sql = `
    WITH per_trace AS (
      SELECT
        trace_id,
        min(toUnixTimestamp64Nano(timestamp))                               AS start_ns,
        max(toUnixTimestamp64Nano(timestamp) + toInt128(duration_ns))       AS end_ns,
        count()                                                             AS span_count,
        countIf(status_code='STATUS_CODE_ERROR')                            AS errors,
        sum(input_tokens)                                                   AS input,
        sum(output_tokens)                                                  AS output,
        countIf(parent_span_id='')                                          AS root_count,
        argMinIf(span_name,    timestamp, parent_span_id='')                AS root_name_explicit,
        argMinIf(service_name, timestamp, parent_span_id='')                AS root_service_explicit,
        argMin(span_name,    timestamp)                                     AS root_name_fallback,
        argMin(service_name, timestamp)                                     AS root_service_fallback
      FROM ${DASHBOARD_SPANS_TABLE}
      ${where}
      GROUP BY trace_id
    )
    SELECT
      trace_id,
      if(root_count > 0, root_name_explicit,    root_name_fallback)    AS root_name,
      if(root_count > 0, root_service_explicit, root_service_fallback) AS root_service,
      root_count > 0                                                   AS root_present,
      formatDateTime(fromUnixTimestamp64Nano(start_ns), '%Y-%m-%dT%H:%i:%SZ') AS started_at,
      toString(end_ns - start_ns)                                      AS duration_ns,
      span_count, errors, input, output
    FROM per_trace
    ORDER BY ${sortCol} ${dir}
    LIMIT {limit:UInt32} OFFSET {offset:UInt32}
  `;
  const rows = await queryDashboardSpans<{
    trace_id: string;
    root_name: string;
    root_service: string;
    root_present: boolean | number | string;
    started_at: string;
    duration_ns: string;
    span_count: string | number;
    errors: string | number;
    input: string | number;
    output: string | number;
  }>(sql, { ...params, limit, offset });

  return {
    total,
    rows: rows.map((r) => ({
      trace_id: String(r.trace_id),
      root_name: String(r.root_name ?? ""),
      root_service: String(r.root_service ?? ""),
      // ClickHouse may surface UInt8(0|1) as a number; coerce truthy.
      root_present:
        r.root_present === true ||
        r.root_present === 1 ||
        r.root_present === "1" ||
        r.root_present === "true",
      started_at: String(r.started_at),
      duration_ns: String(r.duration_ns ?? "0"),
      span_count: Number(r.span_count ?? 0),
      errors: Number(r.errors ?? 0),
      input: Number(r.input ?? 0),
      output: Number(r.output ?? 0),
    })),
  };
}

const SPAN_HARD_LIMIT = 1000;

export async function getTraceTree(
  traceId: string,
): Promise<TraceTreeResult> {
  const sql = `
    SELECT
      SpanId                                              AS span_id,
      ParentSpanId                                        AS parent_span_id,
      TraceId                                             AS trace_id,
      SpanName                                            AS span_name,
      ServiceName                                         AS service_name,
      SpanKind                                            AS span_kind,
      toString(toUnixTimestamp64Nano(Timestamp))          AS started_at_ns,
      toString(toInt128(Duration))                        AS duration_ns,
      StatusCode                                          AS status_code,
      StatusMessage                                       AS status_message,
      SpanAttributes                                      AS attributes,
      ResourceAttributes                                  AS resource,
      Events.Timestamp                                    AS event_ts,
      Events.Name                                         AS event_name,
      Events.Attributes                                   AS event_attrs
    FROM otel_traces
    WHERE TraceId = {trace_id:String}
    ORDER BY Timestamp ASC
    LIMIT {limit:UInt32}
  `;
  type Raw = Omit<SpanRow, "events"> & {
    event_ts: string[];
    event_name: string[];
    event_attrs: Array<Record<string, string>>;
  };
  const rows = await query<Raw>(sql, {
    trace_id: traceId,
    limit: SPAN_HARD_LIMIT,
  });

  const meta = await query<{ c: string | number; root_count: string | number }>(
    `SELECT count() AS c, countIf(ParentSpanId='') AS root_count
       FROM otel_traces WHERE TraceId = {trace_id:String}`,
    { trace_id: traceId },
  );
  const total = Number(meta[0]?.c ?? 0);
  const rootCount = Number(meta[0]?.root_count ?? 0);

  const spans: SpanRow[] = rows.map((r) => {
    const ts = r.event_ts ?? [];
    const names = r.event_name ?? [];
    const attrs = r.event_attrs ?? [];
    const events: SpanRow["events"] = [];
    for (let i = 0; i < ts.length; i += 1) {
      events.push({
        ts: String(ts[i] ?? ""),
        name: String(names[i] ?? ""),
        attrs: (attrs[i] ?? {}) as Record<string, string>,
      });
    }
    return {
      span_id: String(r.span_id),
      parent_span_id: String(r.parent_span_id ?? ""),
      trace_id: String(r.trace_id),
      span_name: String(r.span_name ?? ""),
      service_name: String(r.service_name ?? ""),
      span_kind: String(r.span_kind ?? ""),
      started_at_ns: String(r.started_at_ns ?? "0"),
      duration_ns: String(r.duration_ns ?? "0"),
      status_code: String(r.status_code ?? ""),
      status_message: String(r.status_message ?? ""),
      attributes: (r.attributes ?? {}) as Record<string, string>,
      resource: (r.resource ?? {}) as Record<string, string>,
      events,
    };
  });

  return {
    spans,
    truncated: total > SPAN_HARD_LIMIT,
    root_present: rootCount > 0,
  };
}
