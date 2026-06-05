import { buildProjectionWhere, normalizeModelExpr } from "../filters";
import {
  CHAT_SPAN_SQL,
  DASHBOARD_SPANS_TABLE,
  queryDashboardSpans,
} from "./span_projection";
import type { Filters, SessionRow } from "../../lib/types";

export async function listSessions(filters: Filters): Promise<SessionRow[]> {
  const { where, params } = buildProjectionWhere(filters);
  const sql = `
    SELECT
      session_id,
      -- Trailing Z marks the timestamp as UTC so JS new Date() parses it correctly
      formatDateTime(min(timestamp), '%Y-%m-%dT%H:%i:%SZ') AS start_ts,
      -- Trailing Z marks the timestamp as UTC so JS new Date() parses it correctly
      formatDateTime(max(timestamp), '%Y-%m-%dT%H:%i:%SZ') AS end_ts,
      toUInt64(count()) AS calls,
      toUInt64(sum(input_tokens))  AS input,
      toUInt64(sum(output_tokens)) AS output,
      groupUniqArray(${normalizeModelExpr("response_model")}) AS models
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${where ? "AND" : "WHERE"} ${CHAT_SPAN_SQL}
      AND session_id != ''
    GROUP BY session_id
    ORDER BY end_ts DESC
    LIMIT 200
  `;
  const rows = await queryDashboardSpans<{
    session_id: string;
    start_ts: string;
    end_ts: string;
    calls: number;
    input: number;
    output: number;
    models: string[];
  }>(sql, params);
  return rows.map((r) => ({
    session_id: r.session_id,
    start_ts: r.start_ts,
    end_ts: r.end_ts,
    calls: Number(r.calls ?? 0),
    input: Number(r.input ?? 0),
    output: Number(r.output ?? 0),
    models: (r.models ?? []).filter((m) => m && m !== ""),
  }));
}

export interface SessionTurn {
  span_id: string;
  timestamp: string;
  request_model: string;
  response_model: string;
  input: number;
  output: number;
  duration_ms: number;
  finish_reasons: string;
}

export async function getSession(
  id: string,
): Promise<{
  session_id: string;
  turns: SessionTurn[];
}> {
  const sql = `
    SELECT
      span_id,
      -- Trailing Z marks the timestamp as UTC so JS new Date() parses it correctly
      formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%SZ') AS timestamp,
      ${normalizeModelExpr("coalesce(nullIf(request_model, ''), 'unknown')")}  AS request_model,
      ${normalizeModelExpr("coalesce(nullIf(response_model, ''), 'unknown')")} AS response_model,
      input_tokens  AS input,
      output_tokens AS output,
      duration_ns / 1000000 AS duration_ms,
      coalesce(finish_reasons, '') AS finish_reasons
    FROM ${DASHBOARD_SPANS_TABLE}
    WHERE ${CHAT_SPAN_SQL}
      AND session_id = {id:String}
    ORDER BY timestamp ASC
    LIMIT 1000
  `;
  const turns = await queryDashboardSpans<SessionTurn>(sql, { id });
  return {
    session_id: id,
    turns: turns.map((t) => ({
      ...t,
      input: Number(t.input ?? 0),
      output: Number(t.output ?? 0),
      duration_ms: Number(t.duration_ms ?? 0),
    })),
  };
}
