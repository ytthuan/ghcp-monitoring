import { buildProjectionWhere } from "../filters";
import {
  CHAT_SPAN_SQL,
  DASHBOARD_SPANS_TABLE,
  queryDashboardSpans,
} from "./span_projection";
import type { Filters, TotalsRow } from "../../lib/types";

export async function getTotals(filters: Filters): Promise<TotalsRow> {
  const { where, params } = buildProjectionWhere(filters);
  // Token/cost KPIs use chat spans as the billable source of truth. invoke_agent
  // wrappers can repeat child chat token usage, but still carry session ids.
  const sql = `
    SELECT
      toUInt64(sumIf(input_tokens, ${CHAT_SPAN_SQL}))        AS input,
      toUInt64(sumIf(output_tokens, ${CHAT_SPAN_SQL}))       AS output,
      toUInt64(sumIf(cache_read_tokens, ${CHAT_SPAN_SQL}))   AS cache_read,
      toUInt64(sumIf(cache_create_tokens, ${CHAT_SPAN_SQL})) AS cache_create,
      toUInt64(countIf(${CHAT_SPAN_SQL})) AS calls,
      sumIf(copilot_cost, ${CHAT_SPAN_SQL}) AS copilot_cost,
      toUInt64(countIf(${CHAT_SPAN_SQL} AND copilot_cost_present = 1)) AS copilot_cost_calls,
      toUInt64(uniqExact(session_id)) AS sessions
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${where ? "AND" : "WHERE"} (${CHAT_SPAN_SQL} OR startsWith(span_name, 'invoke_agent'))
  `;
  const rows = await queryDashboardSpans<Record<string, string | number>>(sql, params);
  const r = rows[0] ?? {};
  return {
    input: Number(r.input ?? 0),
    output: Number(r.output ?? 0),
    cache_read: Number(r.cache_read ?? 0),
    cache_create: Number(r.cache_create ?? 0),
    calls: Number(r.calls ?? 0),
    sessions: Number(r.sessions ?? 0),
    copilot_cost: Number(r.copilot_cost ?? 0),
    copilot_cost_calls: Number(r.copilot_cost_calls ?? 0),
  };
}
