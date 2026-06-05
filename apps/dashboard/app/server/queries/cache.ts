import { buildProjectionWhere, normalizeModelExpr } from "../filters";
import {
  CHAT_SPAN_SQL,
  DASHBOARD_SPANS_TABLE,
  queryDashboardSpans,
} from "./span_projection";
import type { Filters } from "../../lib/types";

export interface CacheRow {
  model: string;
  input: number;
  cache_read: number;
  cache_create: number;
  hit_ratio: number;
}

export async function getCacheByModel(filters: Filters): Promise<CacheRow[]> {
  const { where, params } = buildProjectionWhere(filters);
  const sql = `
    SELECT
      ${normalizeModelExpr("coalesce(nullIf(response_model, ''), 'unknown')")} AS model,
      toUInt64(sum(input_tokens)) AS input,
      toUInt64(sum(cache_read_tokens))   AS cache_read,
      toUInt64(sum(cache_create_tokens)) AS cache_create
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${where ? "AND" : "WHERE"} ${CHAT_SPAN_SQL}
    GROUP BY model
    ORDER BY input DESC
    LIMIT 50
  `;
  const rows = await queryDashboardSpans<Record<string, string | number>>(sql, params);
  return rows.map((r) => {
    const input = Number(r.input ?? 0);
    const cr = Number(r.cache_read ?? 0);
    const cc = Number(r.cache_create ?? 0);
    return {
      model: String(r.model),
      input,
      cache_read: cr,
      cache_create: cc,
      hit_ratio: input > 0 ? cr / input : 0,
    };
  });
}
