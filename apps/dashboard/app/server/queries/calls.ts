import { query } from "../clickhouse";
import { buildProjectionWhere, normalizeModelExpr } from "../filters";
import {
  CHAT_SPAN_SQL,
  DASHBOARD_SPANS_TABLE,
  queryDashboardSpans,
} from "./span_projection";
import type { CallRow, Filters } from "../../lib/types";

export interface CallsPage {
  rows: CallRow[];
  total: number;
}

interface CallProjectionRow {
  trace_id: string | number;
  span_id: string | number;
  call_timestamp: string | number;
  request_model: string | number;
  response_model: string | number;
  input: string | number;
  output: string | number;
  cache_read: string | number;
  cache_create: string | number;
  duration_ms: string | number;
  finish_reasons: string | number;
  agent_name: string | number;
  conversation_id: string | number;
  copilot_cost: string | number;
}

export interface CallsArgs {
  filters: Filters;
  pageIndex: number;
  pageSize: number;
  sortBy?: keyof CallRow;
  sortDir?: "asc" | "desc";
}

const SORTABLE: Record<string, string> = {
  timestamp: "timestamp",
  request_model: "request_model",
  response_model: "response_model",
  input: "input",
  output: "output",
  cache_read: "cache_read",
  cache_create: "cache_create",
  duration_ms: "duration_ms",
  agent_name: "agent_name",
  conversation_id: "conversation_id",
  copilot_cost: "copilot_cost",
};

export async function getCalls(args: CallsArgs): Promise<CallsPage> {
  const { where, params } = buildProjectionWhere(args.filters);
  const sortCol = SORTABLE[args.sortBy ?? "timestamp"] ?? "timestamp";
  const dir = args.sortDir === "asc" ? "ASC" : "DESC";
  const limit = Math.min(Math.max(args.pageSize, 1), 200);
  const offset = Math.max(args.pageIndex, 0) * limit;

  const baseFrom = `FROM ${DASHBOARD_SPANS_TABLE} ${where} ${where ? "AND" : "WHERE"} ${CHAT_SPAN_SQL}`;

  const countRows = await queryDashboardSpans<{ c: string | number }>(
    `SELECT count() AS c ${baseFrom}`,
    params,
  );
  const total = Number(countRows[0]?.c ?? 0);

  const sql = `
    SELECT
      trace_id,
      span_id,
      -- Trailing Z marks the timestamp as UTC so JS new Date() parses it correctly.
      -- Keep the output alias distinct from the raw timestamp column so ClickHouse does not substitute the SELECT alias into the WHERE clause.
      formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%SZ') AS call_timestamp,
      ${normalizeModelExpr("coalesce(nullIf(request_model, ''), 'unknown')")}  AS request_model,
      ${normalizeModelExpr("coalesce(nullIf(response_model, ''), 'unknown')")} AS response_model,
      input_tokens  AS input,
      output_tokens AS output,
      cache_read_tokens   AS cache_read,
      cache_create_tokens AS cache_create,
      duration_ns / 1000000 AS duration_ms,
      coalesce(finish_reasons, '') AS finish_reasons,
      coalesce(agent_name, '')     AS agent_name,
      coalesce(session_id, '')     AS conversation_id,
      copilot_cost                 AS copilot_cost
    ${baseFrom}
    ORDER BY ${sortCol} ${dir}
    LIMIT {limit:UInt32} OFFSET {offset:UInt32}
  `;
  const rows = await queryDashboardSpans<CallProjectionRow>(sql, {
    ...params,
    limit,
    offset,
  });
  return {
    total,
    rows: rows.map((r) => ({
      trace_id: String(r.trace_id),
      span_id: String(r.span_id),
      timestamp: String(r.call_timestamp),
      request_model: String(r.request_model),
      response_model: String(r.response_model),
      input: Number(r.input ?? 0),
      output: Number(r.output ?? 0),
      cache_read: Number(r.cache_read ?? 0),
      cache_create: Number(r.cache_create ?? 0),
      duration_ms: Number(r.duration_ms ?? 0),
      finish_reasons: String(r.finish_reasons ?? ""),
      agent_name: String(r.agent_name ?? ""),
      conversation_id: String(r.conversation_id ?? ""),
      copilot_cost: Number(r.copilot_cost ?? 0),
    })),
  };
}

export async function getRevealedContent(
  spanId: string,
): Promise<{
  input_messages: string;
  output_messages: string;
}> {
  const sql = `
    SELECT
      coalesce(SpanAttributes['gen_ai.input.messages'], '')  AS input_messages,
      coalesce(SpanAttributes['gen_ai.output.messages'], '') AS output_messages
    FROM otel_traces
    WHERE SpanId = {span_id:String}
    LIMIT 1
  `;
  const rows = await query<{ input_messages: string; output_messages: string }>(
    sql,
    { span_id: spanId },
  );
  return {
    input_messages: rows[0]?.input_messages ?? "",
    output_messages: rows[0]?.output_messages ?? "",
  };
}
