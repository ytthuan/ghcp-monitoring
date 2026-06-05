import { buildProjectionWhere } from "../filters";
import {
  CHAT_SPAN_SQL,
  DASHBOARD_SPANS_TABLE,
  queryDashboardSpans,
} from "./span_projection";
import type { Filters, HeatCell } from "../../lib/types";

export async function getHeatmap(args: {
  filters: Filters;
  tz: string;
}): Promise<HeatCell[]> {
  const tz = !args.tz || args.tz === "local" ? "UTC" : args.tz;
  const { where, params } = buildProjectionWhere(args.filters);
  params.tz = tz;
  const sql = `
    SELECT
      -- toDayOfWeek's 2nd arg is mode (week-start), not timezone — convert
      -- the timestamp to the target tz first, then derive dow.
      toUInt8(toDayOfWeek(toTimeZone(timestamp, {tz:String}))) AS dow,
      toUInt8(toHour(timestamp, {tz:String}))                  AS hour,
      toUInt64(sum(input_tokens))  AS input,
      toUInt64(sum(output_tokens)) AS output,
      toUInt64(count()) AS calls
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${where ? "AND" : "WHERE"} ${CHAT_SPAN_SQL}
    GROUP BY dow, hour
    ORDER BY dow, hour
  `;
  const rows = await queryDashboardSpans<Record<string, string | number>>(sql, params);
  return rows.map((r) => ({
    dow: Number(r.dow ?? 0),
    hour: Number(r.hour ?? 0),
    input: Number(r.input ?? 0),
    output: Number(r.output ?? 0),
    calls: Number(r.calls ?? 0),
  }));
}
