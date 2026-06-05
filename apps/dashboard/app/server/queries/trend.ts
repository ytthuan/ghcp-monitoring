import { buildProjectionWhere } from "../filters";
import {
  CHAT_SPAN_SQL,
  DASHBOARD_SPANS_TABLE,
  queryDashboardSpans,
} from "./span_projection";
import type { Filters, TrendPoint, Granularity } from "../../lib/types";

// TZ-aware bucketing for trend/finish: 1h and 1d are TZ-sensitive (wall-clock
// hour/day in the user's timezone); 5m buckets are TZ-invariant so stay UTC.
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

export async function getTrend(args: {
  filters: Filters;
  tz: string;
}): Promise<TrendPoint[]> {
  const { filters } = args;
  // Guard: ClickHouse will reject `toStartOfHour(x, {tz:'local'})`. The client
  // should resolve "local" before calling, but fall back to UTC defensively.
  const tz = !args.tz || args.tz === "local" ? "UTC" : args.tz;
  const { where, params } = buildProjectionWhere(filters);
  params.tz = tz;
  const bucket = bucketExprTz(filters.granularity, tz);
  const sql = `
    SELECT
      -- Trailing Z marks the timestamp as UTC so JS new Date() parses it correctly
      formatDateTime(${bucket}, '%Y-%m-%dT%H:%i:%SZ')                              AS bucket,
      toUInt64(sum(input_tokens))        AS input,
      toUInt64(sum(output_tokens))       AS output,
      toUInt64(sum(cache_read_tokens))   AS cache_read,
      toUInt64(sum(cache_create_tokens)) AS cache_create,
      toUInt64(count())                                                           AS calls
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${where ? "AND" : "WHERE"} ${CHAT_SPAN_SQL}
    GROUP BY ${bucket}
    ORDER BY ${bucket} ASC
  `;
  const rows = await queryDashboardSpans<Record<string, string | number>>(sql, params);
  return rows.map((r) => ({
    bucket: String(r.bucket),
    input: Number(r.input ?? 0),
    output: Number(r.output ?? 0),
    cache_read: Number(r.cache_read ?? 0),
    cache_create: Number(r.cache_create ?? 0),
    calls: Number(r.calls ?? 0),
  }));
}
