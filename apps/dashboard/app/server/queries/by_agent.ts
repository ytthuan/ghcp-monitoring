import { buildProjectionWhere } from "../filters";
import {
  CHAT_SPAN_SQL,
  DASHBOARD_SPANS_TABLE,
  queryDashboardSpans,
} from "./span_projection";
import type { AgentRow, Filters } from "../../lib/types";

export async function getByAgent(filters: Filters): Promise<AgentRow[]> {
  const { where, params } = buildProjectionWhere(filters);
  const sql = `
    SELECT
      coalesce(nullIf(agent_name, ''), 'unknown') AS agent_name,
      toUInt64(sum(input_tokens))  AS input,
      toUInt64(sum(output_tokens)) AS output,
      toUInt64(count()) AS calls
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${where ? "AND" : "WHERE"} (${CHAT_SPAN_SQL} OR startsWith(span_name, 'invoke_agent'))
    GROUP BY agent_name
    ORDER BY input + output DESC
    LIMIT 20
  `;
  const rows = await queryDashboardSpans<Record<string, string | number>>(sql, params);
  return rows.map((r) => ({
    agent_name: String(r.agent_name),
    input: Number(r.input ?? 0),
    output: Number(r.output ?? 0),
    calls: Number(r.calls ?? 0),
  }));
}
