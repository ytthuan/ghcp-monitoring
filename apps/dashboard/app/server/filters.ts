/**
 * Translate route search-params filter state into a parameterized SQL fragment.
 * All user-controlled values are passed through ClickHouse query params — never
 * concatenated into the SQL string.
 */
import type { Filters } from "../lib/types";

export interface SqlFragment {
  where: string;
  params: Record<string, unknown>;
}

/**
 * Strips the Copilot internal `-1m-internal` (or `_1m-internal`) suffix from
 * a model name. Wrap this around any SQL expression that yields a model name,
 * so aggregations merge variants and display strings are clean.
 *
 * Mirror of `normalizeModelName` in `./pricing.ts` — keep the patterns in sync.
 */
export const MODEL_NORMALIZE_REGEX = "(?i)[-_]1m[-_]internal$";
export function normalizeModelExpr(expr: string): string {
  return `replaceRegexpOne(${expr}, '${MODEL_NORMALIZE_REGEX}', '')`;
}

const RANGE_TO_SECONDS: Record<string, number> = {
  "1h": 3_600,
  "6h": 21_600,
  "24h": 86_400,
  "7d": 604_800,
  "30d": 2_592_000,
};

/**
 * Build a WHERE fragment for `otel_traces` queries.
 *
 * @param tsColumn name of the timestamp column (default `Timestamp`).
 * @param attrColumn name of the attributes map column (default `SpanAttributes`).
 */
export function buildWhere(
  filters: Filters,
  opts: { tsColumn?: string; attrColumn?: string } = {},
): SqlFragment {
  const ts = opts.tsColumn ?? "Timestamp";
  const attr = opts.attrColumn ?? "SpanAttributes";
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.range === "custom" && filters.from && filters.to) {
    clauses.push(`${ts} BETWEEN parseDateTime64BestEffort({from:String}) AND parseDateTime64BestEffort({to:String})`);
    params.from = filters.from;
    params.to = filters.to;
  } else {
    const seconds = RANGE_TO_SECONDS[filters.range] ?? RANGE_TO_SECONDS["24h"]!;
    clauses.push(`${ts} >= now() - INTERVAL {seconds:UInt32} SECOND`);
    params.seconds = seconds;
  }

  if (filters.models.length > 0) {
    clauses.push(
      `(${normalizeModelExpr(`${attr}['gen_ai.request.model']`)} IN {models:Array(String)} OR ${normalizeModelExpr(`${attr}['gen_ai.response.model']`)} IN {models:Array(String)})`,
    );
    params.models = filters.models;
  }

  if (filters.agents.length > 0) {
    clauses.push(`${attr}['gen_ai.agent.name'] IN {agents:Array(String)}`);
    params.agents = filters.agents;
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export function buildProjectionWhere(
  filters: Filters,
  opts: { tsColumn?: string } = {},
): SqlFragment {
  const ts = opts.tsColumn ?? "timestamp";
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.range === "custom" && filters.from && filters.to) {
    clauses.push(`${ts} BETWEEN parseDateTime64BestEffort({from:String}) AND parseDateTime64BestEffort({to:String})`);
    params.from = filters.from;
    params.to = filters.to;
  } else {
    const seconds = RANGE_TO_SECONDS[filters.range] ?? RANGE_TO_SECONDS["24h"]!;
    clauses.push(`${ts} >= now() - INTERVAL {seconds:UInt32} SECOND`);
    params.seconds = seconds;
  }

  if (filters.models.length > 0) {
    clauses.push(
      `(${normalizeModelExpr("request_model")} IN {models:Array(String)} OR ${normalizeModelExpr("response_model")} IN {models:Array(String)})`,
    );
    params.models = filters.models;
  }

  if (filters.agents.length > 0) {
    clauses.push("agent_name IN {agents:Array(String)}");
    params.agents = filters.agents;
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

/**
 * Map UI granularity to a ClickHouse `toStartOf*` expression for a column name.
 */
export function bucketExpr(
  granularity: Filters["granularity"],
  column = "Timestamp",
): string {
  switch (granularity) {
    case "5m":
      return `toStartOfInterval(${column}, INTERVAL 5 MINUTE)`;
    case "1d":
      return `toStartOfDay(${column})`;
    case "1h":
    default:
      return `toStartOfHour(${column})`;
  }
}
