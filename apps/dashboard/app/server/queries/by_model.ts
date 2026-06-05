import { buildProjectionWhere, normalizeModelExpr } from "../filters";
import { estimateCostBreakdown, internalModelInfo } from "../pricing";
import {
  CHAT_SPAN_SQL,
  DASHBOARD_SPANS_TABLE,
  queryDashboardSpans,
} from "./span_projection";
import type { Filters, ModelRow } from "../../lib/types";

export async function getByModel(filters: Filters): Promise<ModelRow[]> {
  const { where, params } = buildProjectionWhere(filters);
  const sql = `
    SELECT
      ${normalizeModelExpr("coalesce(nullIf(request_model, ''), 'unknown')")}  AS request_model,
      ${normalizeModelExpr("coalesce(nullIf(response_model, ''), 'unknown')")} AS response_model,
      toUInt64(sum(input_tokens))        AS input,
      toUInt64(sum(output_tokens))       AS output,
      toUInt64(sum(cache_read_tokens))   AS cache_read,
      toUInt64(sum(cache_create_tokens)) AS cache_create,
      toUInt64(count()) AS calls,
      toUInt64(sum(duration_ns)) AS total_duration_ns,
      sum(copilot_cost) AS copilot_cost
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${where ? "AND" : "WHERE"} ${CHAT_SPAN_SQL}
    GROUP BY request_model, response_model
    ORDER BY input + output + cache_create DESC
    LIMIT 100
  `;
  const rows = await queryDashboardSpans<Record<string, string | number>>(sql, params);
  return rows.map((r) => {
    const request_model = String(r.request_model);
    const response_model = String(r.response_model);
    const input = Number(r.input ?? 0);
    const output = Number(r.output ?? 0);
    const cache_read = Number(r.cache_read ?? 0);
    const cache_create = Number(r.cache_create ?? 0);
    const cost = estimateCostBreakdown({
      requestModel: request_model,
      responseModel: response_model,
      input,
      output,
      cache_read,
      cache_create,
    });
    return {
      request_model,
      response_model,
      input,
      output,
      cache_read,
      cache_create,
      calls: Number(r.calls ?? 0),
      total_duration_ns: Number(r.total_duration_ns ?? 0),
      cost_input: cost?.breakdown.input ?? null,
      cost_output: cost?.breakdown.output ?? null,
      cost_cache_read: cost?.breakdown.cache_read ?? null,
      cost_cache_create: cost?.breakdown.cache_create ?? null,
      copilot_cost: Number(r.copilot_cost ?? 0),
      is_internal:
        internalModelInfo(request_model) != null ||
        internalModelInfo(response_model) != null,
    };
  });
}
