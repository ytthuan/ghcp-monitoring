import { buildProjectionWhere } from "../filters";
import {
  DASHBOARD_SPANS_TABLE,
  TOOL_SPAN_SQL,
  queryDashboardSpans,
} from "./span_projection";
import type { Filters, ToolRow } from "../../lib/types";

export async function getTools(filters: Filters): Promise<ToolRow[]> {
  const { where, params } = buildProjectionWhere(filters);
  const sql = `
    SELECT
      coalesce(nullIf(tool_name, ''), 'unknown') AS tool_name,
      toUInt64(count()) AS count,
      toUInt64(countIf(status_code = 'STATUS_CODE_ERROR')) AS error_count,
      avg(duration_ns / 1000000) AS mean_ms,
      quantile(0.50)(duration_ns / 1000000) AS p50_ms,
      quantile(0.90)(duration_ns / 1000000) AS p90_ms,
      quantile(0.99)(duration_ns / 1000000) AS p99_ms,
      countIf(status_code = 'STATUS_CODE_ERROR') / nullIf(count(), 0) AS error_rate,
      formatDateTime(max(timestamp), '%Y-%m-%dT%H:%i:%SZ') AS latest_at
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${where ? "AND" : "WHERE"} ${TOOL_SPAN_SQL}
    GROUP BY tool_name
    ORDER BY count DESC
    LIMIT 50
  `;
  const rows = await queryDashboardSpans<Record<string, string | number>>(sql, params);
  return rows.map((r) => ({
    tool_name: String(r.tool_name),
    count: Number(r.count ?? 0),
    error_count: Number(r.error_count ?? 0),
    mean_ms: Number(r.mean_ms ?? 0),
    p50_ms: Number(r.p50_ms ?? 0),
    p90_ms: Number(r.p90_ms ?? 0),
    p99_ms: Number(r.p99_ms ?? 0),
    error_rate: Number(r.error_rate ?? 0),
    latest_at: String(r.latest_at ?? ""),
  }));
}
