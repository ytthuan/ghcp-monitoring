import { buildProjectionWhere, normalizeModelExpr } from "../filters";
import {
  CHAT_SPAN_SQL,
  DASHBOARD_SPANS_TABLE,
  queryDashboardSpans,
} from "./span_projection";
import type { Filters, LatencyRow } from "../../lib/types";

/**
 * Per-model latency quantiles. Computes from `otel_traces.Duration` (ns); if
 * the histogram metric `gen_ai.client.operation.duration` is present, callers
 * can prefer `getLatencyFromMetric` instead.
 */
export async function getLatencyByModel(filters: Filters): Promise<LatencyRow[]> {
  const { where, params } = buildProjectionWhere(filters);
  const sql = `
    SELECT
      ${normalizeModelExpr("coalesce(nullIf(response_model, ''), 'unknown')")} AS model,
      quantile(0.5)(duration_ns / 1000000)  AS p50_ms,
      quantile(0.9)(duration_ns / 1000000)  AS p90_ms,
      quantile(0.99)(duration_ns / 1000000) AS p99_ms,
      toUInt64(count())                  AS count
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${where ? "AND" : "WHERE"} ${CHAT_SPAN_SQL}
    GROUP BY model
    ORDER BY count DESC
    LIMIT 25
  `;
  const rows = await queryDashboardSpans<Record<string, string | number>>(sql, params);
  return rows.map((r) => ({
    model: String(r.model),
    p50_ms: Number(r.p50_ms ?? 0),
    p90_ms: Number(r.p90_ms ?? 0),
    p99_ms: Number(r.p99_ms ?? 0),
    count: Number(r.count ?? 0),
  }));
}
