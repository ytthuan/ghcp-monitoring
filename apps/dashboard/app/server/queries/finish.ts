import { buildProjectionWhere } from "../filters";
import {
  CHAT_SPAN_SQL,
  DASHBOARD_SPANS_TABLE,
  queryDashboardSpans,
} from "./span_projection";
import type { Filters, FinishRow, Granularity } from "../../lib/types";

// TZ-aware bucketing (mirror of trend.ts): 5m stays UTC (TZ-invariant), 1h/1d
// pivot on user wall-clock so daily/hourly buckets line up with the user's day.
function bucketExprTz(
  granularity: Granularity,
  tz: string,
  column = "timestamp",
): string {
  switch (granularity) {
    case "5m":
      return `toStartOfInterval(${column}, INTERVAL 5 MINUTE)`;
    case "1d":
      return `toStartOfDay(${column}, {tz:String})`;
    case "1h":
    default:
      return `toStartOfHour(${column}, {tz:String})`;
  }
}

export async function getFinishReasons(filters: Filters): Promise<FinishRow[]> {
  const { where, params } = buildProjectionWhere(filters);
  const sql = `
    SELECT reason, toUInt64(count()) AS count
    FROM (
      SELECT
        arrayJoin(
          ifNull(
            JSONExtract(finish_reasons, 'Array(String)'),
            ['unknown']
          )
        ) AS reason
      FROM ${DASHBOARD_SPANS_TABLE}
      ${where}
        ${where ? "AND" : "WHERE"} ${CHAT_SPAN_SQL}
    )
    GROUP BY reason
    ORDER BY count DESC
    LIMIT 20
  `;
  const rows = await queryDashboardSpans<Record<string, string | number>>(sql, params);
  return rows.map((r) => ({
    reason: String(r.reason),
    count: Number(r.count ?? 0),
  }));
}

export interface FinishOverTimePoint {
  bucket: string;
  reason: string;
  count: number;
}

export async function getFinishOverTime(args: {
  filters: Filters;
  tz: string;
}): Promise<FinishOverTimePoint[]> {
  const { filters } = args;
  const tz = !args.tz || args.tz === "local" ? "UTC" : args.tz;
  const { where, params } = buildProjectionWhere(filters);
  params.tz = tz;
  const bucket = bucketExprTz(filters.granularity, tz);
  const sql = `
    SELECT
      -- Trailing Z marks the timestamp as UTC so JS new Date() parses it correctly
      formatDateTime(${bucket}, '%Y-%m-%dT%H:%i:%SZ') AS bucket,
      reason,
      toUInt64(count()) AS count
    FROM (
      SELECT
        timestamp,
        arrayJoin(
          ifNull(
            JSONExtract(finish_reasons, 'Array(String)'),
            ['unknown']
          )
        ) AS reason
      FROM ${DASHBOARD_SPANS_TABLE}
      ${where}
        ${where ? "AND" : "WHERE"} ${CHAT_SPAN_SQL}
    )
    GROUP BY bucket, reason
    ORDER BY bucket, reason
  `;
  const rows = await queryDashboardSpans<Record<string, string | number>>(sql, params);
  return rows.map((r) => ({
    bucket: String(r.bucket),
    reason: String(r.reason),
    count: Number(r.count ?? 0),
  }));
}
