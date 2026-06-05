import { buildProjectionWhere, normalizeModelExpr } from "../filters";
import {
  additiveTokenTotal,
  cacheHitRatio,
  estimateCostBreakdown,
  internalModelInfo,
  pickPricingModel,
  type ModelRate,
} from "../pricing";
import type { Filters, Granularity, HeatCell } from "../../lib/types";
import { getHeatmap } from "./heatmap";
import {
  CHAT_SPAN_SQL,
  DASHBOARD_SPANS_TABLE,
  TOOL_SPAN_SQL,
  queryDashboardSpans,
} from "./span_projection";

export interface CostTrendPoint {
  bucket: string;
  cost: number;
  calls: number;
  tokens: number;
  cache_ratio: number;
}

export interface TokenMixRow {
  name: string;
  value: number;
}

export interface ModelInsightRow {
  model: string;
  request_model: string;
  response_model: string;
  calls: number;
  input: number;
  output: number;
  cache_read: number;
  cache_create: number;
  reasoning: number;
  tokens: number;
  cost: number | null;
  cost_input: number | null;
  cost_output: number | null;
  cost_cache_read: number | null;
  cost_cache_create: number | null;
  is_internal: boolean;
  cost_per_1k: number | null;
  cost_per_call: number | null;
  tokens_per_call: number;
  p90_ms: number | null;
}

export interface AgentInsightRow {
  agent_name: string;
  calls: number;
  input: number;
  output: number;
  tokens: number;
}

export interface ToolInsightRow {
  tool_name: string;
  count: number;
  error_count: number;
  error_rate: number;
  mean_ms: number;
  p50_ms: number;
  p90_ms: number;
  p99_ms: number;
}

export interface PercentileSummary {
  count: number;
  p50_ms: number;
  p90_ms: number;
  p99_ms: number;
}

export interface HistogramRow {
  bucket: string;
  count: number;
}

export interface LargestTraceRow {
  trace_id: string;
  started_at: string;
  root_name: string;
  root_service: string;
  duration_ms: number;
  span_count: number;
  errors: number;
}

export interface OverviewInsights {
  cost: {
    total: number;
    unknownModels: number;
  };
  costTrend: CostTrendPoint[];
  tokenMix: TokenMixRow[];
  cacheRatioTrend: Array<{ bucket: string; value: number }>;
  cacheSavings: {
    savings: number;
    eligibleCacheRead: number;
    totalCacheRead: number;
    coverage: number;
  };
  modelEconomics: ModelInsightRow[];
  modelCostShare: Array<{ model: string; cost: number }>;
  agentShare: AgentInsightRow[];
  tools: ToolInsightRow[];
  toolTrend: Array<Record<string, string | number>>;
  toolTrendKeys: string[];
  performance: {
    chat: PercentileSummary;
    tool: PercentileSummary;
    trace: PercentileSummary;
    ttft: PercentileSummary;
    firstChunk: PercentileSummary;
  };
  heatmap: HeatCell[];
  sessionDepth: {
    count: number;
    avgCalls: number;
    p90Calls: number;
    avgTokens: number;
    callsHistogram: HistogramRow[];
    tokensHistogram: HistogramRow[];
  };
  traceShape: {
    spanHistogram: HistogramRow[];
    durationHistogram: HistogramRow[];
    largest: LargestTraceRow[];
  };
}

interface ModelBucketRow {
  bucket: string;
  model: string;
  request_model: string;
  response_model: string;
  input: string | number;
  output: string | number;
  cache_read: string | number;
  cache_create: string | number;
  reasoning: string | number;
  calls: string | number;
}

interface ModelLatencyRow {
  model: string;
  p90_ms: string | number;
}

interface SessionStatsRow {
  count: string | number;
  avg_calls: string | number;
  p90_calls: string | number;
  avg_tokens: string | number;
  calls_1: string | number;
  calls_2_3: string | number;
  calls_4_7: string | number;
  calls_8_15: string | number;
  calls_16_plus: string | number;
  tokens_lt_1k: string | number;
  tokens_1k_10k: string | number;
  tokens_10k_100k: string | number;
  tokens_100k_1m: string | number;
  tokens_1m_plus: string | number;
}

interface TraceDistributionRow {
  span_1: string | number;
  span_2_5: string | number;
  span_6_20: string | number;
  span_21_100: string | number;
  span_100_plus: string | number;
  duration_lt_1s: string | number;
  duration_1_5s: string | number;
  duration_5_30s: string | number;
  duration_30_120s: string | number;
  duration_120s_plus: string | number;
}

interface TraceShapeRow {
  trace_id: string;
  started_at: string;
  root_name: string;
  root_service: string;
  duration_ms: string | number;
  span_count: string | number;
  errors: string | number;
}

const M = 1_000_000;

function bucketExprTz(
  granularity: Granularity,
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

function num(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function emptySummary(): PercentileSummary {
  return { count: 0, p50_ms: 0, p90_ms: 0, p99_ms: 0 };
}

function percentileSummary(row: Record<string, string | number> | undefined): PercentileSummary {
  if (!row) return emptySummary();
  return {
    count: num(row.count),
    p50_ms: num(row.p50_ms),
    p90_ms: num(row.p90_ms),
    p99_ms: num(row.p99_ms),
  };
}

function settledValue<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
  label: string,
): T {
  if (result.status === "fulfilled") return result.value;
  console.error(`[dashboard] overview query failed: ${label}`, result.reason);
  return fallback;
}

function cacheSavingsFor(rate: ModelRate, cacheRead: number): number | null {
  if (cacheRead <= 0 || rate.input <= rate.cache_read) return null;
  return (cacheRead * (rate.input - rate.cache_read)) / M;
}

function trendRowsByBucket(modelBuckets: ModelBucketRow[]): {
  costTrend: CostTrendPoint[];
  cacheRatioTrend: Array<{ bucket: string; value: number }>;
} {
  const byBucket = new Map<
    string,
    {
      cost: number;
      calls: number;
      tokens: number;
      input: number;
      output: number;
      cache_read: number;
      cache_create: number;
    }
  >();

  for (const row of modelBuckets) {
    const bucket = row.bucket;
    const current =
      byBucket.get(bucket) ??
      {
        cost: 0,
        calls: 0,
        tokens: 0,
        input: 0,
        output: 0,
        cache_read: 0,
        cache_create: 0,
      };
    const input = num(row.input);
    const output = num(row.output);
    const cache_read = num(row.cache_read);
    const cache_create = num(row.cache_create);
    const cost = estimateCostBreakdown({
      requestModel: row.request_model,
      responseModel: row.response_model,
      input,
      output,
      cache_read,
      cache_create,
    })?.cost;
    current.cost += cost ?? 0;
    current.calls += num(row.calls);
    current.input += input;
    current.output += output;
    current.cache_read += cache_read;
    current.cache_create += cache_create;
    current.tokens += additiveTokenTotal({
      input,
      output,
      cache_create,
      reasoning: num(row.reasoning),
    });
    byBucket.set(bucket, current);
  }

  const ordered = [...byBucket.entries()].sort(([a], [b]) => a.localeCompare(b));
  return {
    costTrend: ordered.map(([bucket, row]) => ({
      bucket,
      cost: row.cost,
      calls: row.calls,
      tokens: row.tokens,
      cache_ratio: cacheHitRatio(row.input, row.cache_read),
    })),
    cacheRatioTrend: ordered.map(([bucket, row]) => ({
      bucket,
      value: Number((cacheHitRatio(row.input, row.cache_read) * 100).toFixed(2)),
    })),
  };
}

function modelEconomics(
  modelBuckets: ModelBucketRow[],
  latencies: ModelLatencyRow[],
): {
  rows: ModelInsightRow[];
  costShare: Array<{ model: string; cost: number }>;
  tokenMix: TokenMixRow[];
  cacheSavings: OverviewInsights["cacheSavings"];
  cost: OverviewInsights["cost"];
} {
  const byModel = new Map<
    string,
    Omit<ModelInsightRow, "cost_per_1k" | "cost_per_call" | "tokens_per_call" | "p90_ms" | "is_internal">
  >();
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheCreate = 0;
  let totalReasoning = 0;
  let eligibleCacheRead = 0;
  let savings = 0;
  let costTotal = 0;
  const unknownModels = new Set<string>();

  for (const row of modelBuckets) {
    const model = row.model || row.response_model || row.request_model || "unknown";
    const current =
      byModel.get(model) ??
      {
        model,
        request_model: row.request_model,
        response_model: row.response_model,
        calls: 0,
        input: 0,
        output: 0,
        cache_read: 0,
        cache_create: 0,
        reasoning: 0,
        tokens: 0,
        cost: null,
        cost_input: null,
        cost_output: null,
        cost_cache_read: null,
        cost_cache_create: null,
      };
    const input = num(row.input);
    const output = num(row.output);
    const cache_read = num(row.cache_read);
    const cache_create = num(row.cache_create);
    const reasoning = num(row.reasoning);
    const calls = num(row.calls);
    const cost = estimateCostBreakdown({
      requestModel: row.request_model,
      responseModel: row.response_model,
      input,
      output,
      cache_read,
      cache_create,
    });
    const picked = pickPricingModel(row.request_model, row.response_model);
    const rowSavings = picked ? cacheSavingsFor(picked.rate, cache_read) : null;
    if (rowSavings != null) {
      savings += rowSavings;
      eligibleCacheRead += cache_read;
    }
    if (cost) {
      costTotal += cost.cost;
    } else {
      // NOTE: internal-only models (e.g. copilot-nes-*) now resolve to a
      // zero-rate via pricing.rateFor(), so `cost` is non-null with cost === 0
      // and they are intentionally NOT added to `unknownModels`. Only models
      // with no resolvable rate at all land here.
      unknownModels.add(model);
    }
    current.calls += calls;
    current.input += input;
    current.output += output;
    current.cache_read += cache_read;
    current.cache_create += cache_create;
    current.reasoning += reasoning;
    current.tokens += additiveTokenTotal({
      input,
      output,
      cache_create,
      reasoning,
    });
    if (cost) {
      current.cost = (current.cost ?? 0) + cost.cost;
      current.cost_input = (current.cost_input ?? 0) + cost.breakdown.input;
      current.cost_output = (current.cost_output ?? 0) + cost.breakdown.output;
      current.cost_cache_read = (current.cost_cache_read ?? 0) + cost.breakdown.cache_read;
      current.cost_cache_create =
        (current.cost_cache_create ?? 0) + cost.breakdown.cache_create;
    }
    byModel.set(model, current);
    totalInput += input;
    totalOutput += output;
    totalCacheRead += cache_read;
    totalCacheCreate += cache_create;
    totalReasoning += reasoning;
  }

  const p90ByModel = new Map(latencies.map((row) => [row.model, num(row.p90_ms)]));
  const rows = [...byModel.values()]
    .map((row) => {
      const cost = row.cost ?? null;
      const is_internal =
        internalModelInfo(row.request_model) != null ||
        internalModelInfo(row.response_model) != null;
      return {
        ...row,
        cost,
        is_internal,
        cost_per_1k: cost != null && row.tokens > 0 ? (cost / row.tokens) * 1000 : null,
        cost_per_call: cost != null && row.calls > 0 ? cost / row.calls : null,
        tokens_per_call: row.calls > 0 ? row.tokens / row.calls : 0,
        p90_ms: p90ByModel.get(row.model) ?? null,
      };
    })
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 8);

  return {
    rows,
    costShare: rows
      .filter((row) => (row.cost ?? 0) > 0)
      .map((row) => ({ model: row.model, cost: row.cost ?? 0 })),
    tokenMix: [
      { name: "input", value: totalInput },
      { name: "output", value: totalOutput },
      { name: "cache_read", value: totalCacheRead },
      { name: "cache_create", value: totalCacheCreate },
      { name: "reasoning", value: totalReasoning },
    ].filter((row) => row.value > 0),
    cacheSavings: {
      savings,
      eligibleCacheRead,
      totalCacheRead,
      coverage: totalCacheRead > 0 ? eligibleCacheRead / totalCacheRead : 0,
    },
    cost: {
      total: costTotal,
      unknownModels: unknownModels.size,
    },
  };
}

function toolTrendRows(rows: Array<Record<string, string | number>>): {
  trend: Array<Record<string, string | number>>;
  keys: string[];
} {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const tool = String(row.tool_name ?? "unknown");
    totals.set(tool, (totals.get(tool) ?? 0) + num(row.count));
  }
  const keys = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tool]) => tool);
  const byBucket = new Map<string, Record<string, string | number>>();
  for (const row of rows) {
    const tool = String(row.tool_name ?? "unknown");
    if (!keys.includes(tool)) continue;
    const bucket = String(row.bucket);
    const current = byBucket.get(bucket) ?? { bucket };
    current[tool] = num(row.count);
    byBucket.set(bucket, current);
  }
  return {
    keys,
    trend: [...byBucket.values()].sort((a, b) =>
      String(a.bucket).localeCompare(String(b.bucket)),
    ),
  };
}

export async function getOverviewInsights(args: {
  filters: Filters;
  tz: string;
}): Promise<OverviewInsights> {
  const tz = !args.tz || args.tz === "local" ? "UTC" : args.tz;
  const { where, params } = buildProjectionWhere(args.filters);
  const queryParams = { ...params, tz };
  const bucket = bucketExprTz(args.filters.granularity);
  const whereAnd = where ? "AND" : "WHERE";
  const modelExpr = `${normalizeModelExpr("coalesce(nullIf(response_model, ''), nullIf(request_model, ''), 'unknown')")}`;

  const modelBucketsSql = `
    SELECT
      formatDateTime(${bucket}, '%Y-%m-%dT%H:%i:%SZ') AS bucket,
      ${modelExpr} AS model,
      ${normalizeModelExpr("coalesce(nullIf(request_model, ''), 'unknown')")} AS request_model,
      ${normalizeModelExpr("coalesce(nullIf(response_model, ''), 'unknown')")} AS response_model,
      toUInt64(sum(input_tokens)) AS input,
      toUInt64(sum(output_tokens)) AS output,
      toUInt64(sum(cache_read_tokens)) AS cache_read,
      toUInt64(sum(cache_create_tokens)) AS cache_create,
      toUInt64(sum(reasoning_output_tokens)) AS reasoning,
      toUInt64(count()) AS calls
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${whereAnd} ${CHAT_SPAN_SQL}
    GROUP BY bucket, model, request_model, response_model
    ORDER BY bucket ASC, input + output + cache_create DESC
    LIMIT 1500
  `;

  const modelLatencySql = `
    SELECT
      ${modelExpr} AS model,
      quantile(0.90)(duration_ns / 1000000) AS p90_ms
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${whereAnd} ${CHAT_SPAN_SQL}
    GROUP BY model
    ORDER BY count() DESC
    LIMIT 25
  `;

  const agentSql = `
    SELECT
      coalesce(nullIf(agent_name, ''), 'unknown') AS agent_name,
      toUInt64(count()) AS calls,
      toUInt64(sum(input_tokens)) AS input,
      toUInt64(sum(output_tokens)) AS output
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${whereAnd} (${CHAT_SPAN_SQL} OR startsWith(span_name, 'invoke_agent'))
    GROUP BY agent_name
    ORDER BY input + output DESC
    LIMIT 8
  `;

  const toolSql = `
    SELECT
      coalesce(nullIf(tool_name, ''), 'unknown') AS tool_name,
      toUInt64(count()) AS count,
      toUInt64(countIf(status_code = 'STATUS_CODE_ERROR')) AS error_count,
      countIf(status_code = 'STATUS_CODE_ERROR') / nullIf(count(), 0) AS error_rate,
      avg(duration_ns / 1000000) AS mean_ms,
      quantile(0.50)(duration_ns / 1000000) AS p50_ms,
      quantile(0.90)(duration_ns / 1000000) AS p90_ms,
      quantile(0.99)(duration_ns / 1000000) AS p99_ms
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${whereAnd} ${TOOL_SPAN_SQL}
    GROUP BY tool_name
    ORDER BY count DESC
    LIMIT 12
  `;

  const toolTrendSql = `
    SELECT
      formatDateTime(${bucket}, '%Y-%m-%dT%H:%i:%SZ') AS bucket,
      coalesce(nullIf(tool_name, ''), 'unknown') AS tool_name,
      toUInt64(count()) AS count
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${whereAnd} ${TOOL_SPAN_SQL}
    GROUP BY bucket, tool_name
    ORDER BY bucket ASC, count DESC
    LIMIT 1500
  `;

  const chatPerfSql = `
    SELECT
      toUInt64(count()) AS count,
      quantile(0.50)(duration_ns / 1000000) AS p50_ms,
      quantile(0.90)(duration_ns / 1000000) AS p90_ms,
      quantile(0.99)(duration_ns / 1000000) AS p99_ms
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${whereAnd} ${CHAT_SPAN_SQL}
  `;

  const toolPerfSql = `
    SELECT
      toUInt64(count()) AS count,
      quantile(0.50)(duration_ns / 1000000) AS p50_ms,
      quantile(0.90)(duration_ns / 1000000) AS p90_ms,
      quantile(0.99)(duration_ns / 1000000) AS p99_ms
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${whereAnd} startsWith(span_name, 'execute_tool ')
  `;

  const tracePerfSql = `
    WITH per_trace AS (
      SELECT
        trace_id,
        (max(toUnixTimestamp64Nano(timestamp) + toInt128(duration_ns)) - min(toUnixTimestamp64Nano(timestamp))) / 1000000 AS duration_ms
      FROM ${DASHBOARD_SPANS_TABLE}
      ${where}
      GROUP BY trace_id
    )
    SELECT
      toUInt64(count()) AS count,
      quantile(0.50)(duration_ms) AS p50_ms,
      quantile(0.90)(duration_ms) AS p90_ms,
      quantile(0.99)(duration_ms) AS p99_ms
    FROM per_trace
  `;

  const streamingPerfSql = (column: "ttft_ms" | "first_chunk_ms") => `
    SELECT
      toUInt64(countIf(isNotNull(${column}))) AS count,
      quantileIf(0.50)(${column}, isNotNull(${column})) AS p50_ms,
      quantileIf(0.90)(${column}, isNotNull(${column})) AS p90_ms,
      quantileIf(0.99)(${column}, isNotNull(${column})) AS p99_ms
    FROM ${DASHBOARD_SPANS_TABLE}
    ${where}
      ${whereAnd} ${CHAT_SPAN_SQL}
  `;

  const sessionStatsSql = `
    WITH per_session AS (
      SELECT
        session_id,
        toUInt64(count()) AS calls,
        toUInt64(sum(
          input_tokens +
          output_tokens +
          cache_read_tokens +
          cache_create_tokens
        )) AS tokens
      FROM ${DASHBOARD_SPANS_TABLE}
      ${where}
        ${whereAnd} ${CHAT_SPAN_SQL}
        AND session_id != ''
      GROUP BY session_id
    )
    SELECT
      toUInt64(count()) AS count,
      if(count() = 0, 0, avg(calls)) AS avg_calls,
      if(count() = 0, 0, quantile(0.90)(calls)) AS p90_calls,
      if(count() = 0, 0, avg(tokens)) AS avg_tokens,
      toUInt64(countIf(calls = 1)) AS calls_1,
      toUInt64(countIf(calls > 1 AND calls <= 3)) AS calls_2_3,
      toUInt64(countIf(calls > 3 AND calls <= 7)) AS calls_4_7,
      toUInt64(countIf(calls > 7 AND calls <= 15)) AS calls_8_15,
      toUInt64(countIf(calls > 15)) AS calls_16_plus,
      toUInt64(countIf(tokens <= 1000)) AS tokens_lt_1k,
      toUInt64(countIf(tokens > 1000 AND tokens <= 10000)) AS tokens_1k_10k,
      toUInt64(countIf(tokens > 10000 AND tokens <= 100000)) AS tokens_10k_100k,
      toUInt64(countIf(tokens > 100000 AND tokens <= 1000000)) AS tokens_100k_1m,
      toUInt64(countIf(tokens > 1000000)) AS tokens_1m_plus
    FROM per_session
  `;

  const traceDistributionSql = `
    WITH per_trace AS (
      SELECT
        trace_id,
        (max(toUnixTimestamp64Nano(timestamp) + toInt128(duration_ns)) - min(toUnixTimestamp64Nano(timestamp))) / 1000000 AS duration_ms,
        toUInt64(count()) AS span_count
      FROM ${DASHBOARD_SPANS_TABLE}
      ${where}
      GROUP BY trace_id
    )
    SELECT
      toUInt64(countIf(span_count = 1)) AS span_1,
      toUInt64(countIf(span_count > 1 AND span_count <= 5)) AS span_2_5,
      toUInt64(countIf(span_count > 5 AND span_count <= 20)) AS span_6_20,
      toUInt64(countIf(span_count > 20 AND span_count <= 100)) AS span_21_100,
      toUInt64(countIf(span_count > 100)) AS span_100_plus,
      toUInt64(countIf(duration_ms <= 1000)) AS duration_lt_1s,
      toUInt64(countIf(duration_ms > 1000 AND duration_ms <= 5000)) AS duration_1_5s,
      toUInt64(countIf(duration_ms > 5000 AND duration_ms <= 30000)) AS duration_5_30s,
      toUInt64(countIf(duration_ms > 30000 AND duration_ms <= 120000)) AS duration_30_120s,
      toUInt64(countIf(duration_ms > 120000)) AS duration_120s_plus
    FROM per_trace
  `;

  const largestTraceSql = `
    WITH per_trace AS (
      SELECT
        trace_id,
        formatDateTime(min(timestamp), '%Y-%m-%dT%H:%i:%SZ') AS started_at,
        argMin(span_name, timestamp) AS root_name,
        argMin(service_name, timestamp) AS root_service,
        (max(toUnixTimestamp64Nano(timestamp) + toInt128(duration_ns)) - min(toUnixTimestamp64Nano(timestamp))) / 1000000 AS duration_ms,
        toUInt64(count()) AS span_count,
        toUInt64(countIf(status_code = 'STATUS_CODE_ERROR')) AS errors
      FROM ${DASHBOARD_SPANS_TABLE}
      ${where}
      GROUP BY trace_id
    )
    SELECT
      trace_id,
      started_at,
      root_name,
      root_service,
      duration_ms,
      span_count,
      errors
    FROM per_trace
    ORDER BY span_count DESC, duration_ms DESC
    LIMIT 8
  `;

  const results = await Promise.allSettled([
    queryDashboardSpans<ModelBucketRow>(modelBucketsSql, queryParams),
    queryDashboardSpans<ModelLatencyRow>(modelLatencySql, params),
    queryDashboardSpans<Record<string, string | number>>(agentSql, params),
    queryDashboardSpans<Record<string, string | number>>(toolSql, params),
    queryDashboardSpans<Record<string, string | number>>(toolTrendSql, queryParams),
    queryDashboardSpans<Record<string, string | number>>(chatPerfSql, params),
    queryDashboardSpans<Record<string, string | number>>(toolPerfSql, params),
    queryDashboardSpans<Record<string, string | number>>(tracePerfSql, params),
    queryDashboardSpans<Record<string, string | number>>(
      streamingPerfSql("ttft_ms"),
      params,
    ),
    queryDashboardSpans<Record<string, string | number>>(
      streamingPerfSql("first_chunk_ms"),
      params,
    ),
    queryDashboardSpans<SessionStatsRow>(sessionStatsSql, params),
    queryDashboardSpans<TraceDistributionRow>(traceDistributionSql, params),
    queryDashboardSpans<TraceShapeRow>(largestTraceSql, params),
    getHeatmap({ filters: args.filters, tz }),
  ] as const);

  const modelBuckets = settledValue(results[0], [] as ModelBucketRow[], "model buckets");
  const modelLatencies = settledValue(results[1], [] as ModelLatencyRow[], "model latency");
  const agentRows = settledValue(
    results[2],
    [] as Array<Record<string, string | number>>,
    "agent share",
  );
  const toolRows = settledValue(
    results[3],
    [] as Array<Record<string, string | number>>,
    "tool summary",
  );
  const toolTrendRaw = settledValue(
    results[4],
    [] as Array<Record<string, string | number>>,
    "tool trend",
  );
  const chatPerfRows = settledValue(
    results[5],
    [] as Array<Record<string, string | number>>,
    "chat performance",
  );
  const toolPerfRows = settledValue(
    results[6],
    [] as Array<Record<string, string | number>>,
    "tool performance",
  );
  const tracePerfRows = settledValue(
    results[7],
    [] as Array<Record<string, string | number>>,
    "trace performance",
  );
  const ttftRows = settledValue(
    results[8],
    [] as Array<Record<string, string | number>>,
    "time to first token",
  );
  const firstChunkRows = settledValue(
    results[9],
    [] as Array<Record<string, string | number>>,
    "time to first chunk",
  );
  const sessionStatsRows = settledValue(
    results[10],
    [] as SessionStatsRow[],
    "session depth",
  );
  const traceDistributionRows = settledValue(
    results[11],
    [] as TraceDistributionRow[],
    "trace distribution",
  );
  const largestTraceRows = settledValue(
    results[12],
    [] as TraceShapeRow[],
    "largest traces",
  );
  const heatmap = settledValue(results[13], [] as HeatCell[], "heatmap");

  const { costTrend, cacheRatioTrend } = trendRowsByBucket(modelBuckets);
  const model = modelEconomics(modelBuckets, modelLatencies);
  const toolTrend = toolTrendRows(toolTrendRaw);

  const sessionStats = sessionStatsRows[0];
  const traceDistribution = traceDistributionRows[0];
  const largestTraces = largestTraceRows.map((row) => ({
    trace_id: row.trace_id,
    started_at: row.started_at,
    root_name: row.root_name,
    root_service: row.root_service,
    duration_ms: num(row.duration_ms),
    span_count: num(row.span_count),
    errors: num(row.errors),
  }));

  return {
    cost: model.cost,
    costTrend,
    tokenMix: model.tokenMix,
    cacheRatioTrend,
    cacheSavings: model.cacheSavings,
    modelEconomics: model.rows,
    modelCostShare: model.costShare,
    agentShare: agentRows.map((row) => ({
      agent_name: String(row.agent_name ?? "unknown"),
      calls: num(row.calls),
      input: num(row.input),
      output: num(row.output),
      tokens: num(row.input) + num(row.output),
    })),
    tools: toolRows.map((row) => ({
      tool_name: String(row.tool_name ?? "unknown"),
      count: num(row.count),
      error_count: num(row.error_count),
      error_rate: num(row.error_rate),
      mean_ms: num(row.mean_ms),
      p50_ms: num(row.p50_ms),
      p90_ms: num(row.p90_ms),
      p99_ms: num(row.p99_ms),
    })),
    toolTrend: toolTrend.trend,
    toolTrendKeys: toolTrend.keys,
    performance: {
      chat: percentileSummary(chatPerfRows[0]),
      tool: percentileSummary(toolPerfRows[0]),
      trace: percentileSummary(tracePerfRows[0]),
      ttft: percentileSummary(ttftRows[0]),
      firstChunk: percentileSummary(firstChunkRows[0]),
    },
    heatmap,
    sessionDepth: {
      count: num(sessionStats?.count),
      avgCalls: num(sessionStats?.avg_calls),
      p90Calls: num(sessionStats?.p90_calls),
      avgTokens: num(sessionStats?.avg_tokens),
      callsHistogram: [
        { bucket: "1", count: num(sessionStats?.calls_1) },
        { bucket: "2-3", count: num(sessionStats?.calls_2_3) },
        { bucket: "4-7", count: num(sessionStats?.calls_4_7) },
        { bucket: "8-15", count: num(sessionStats?.calls_8_15) },
        { bucket: "16+", count: num(sessionStats?.calls_16_plus) },
      ],
      tokensHistogram: [
        { bucket: "<1K", count: num(sessionStats?.tokens_lt_1k) },
        { bucket: "1-10K", count: num(sessionStats?.tokens_1k_10k) },
        { bucket: "10-100K", count: num(sessionStats?.tokens_10k_100k) },
        { bucket: "100K-1M", count: num(sessionStats?.tokens_100k_1m) },
        { bucket: "1M+", count: num(sessionStats?.tokens_1m_plus) },
      ],
    },
    traceShape: {
      spanHistogram: [
        { bucket: "1", count: num(traceDistribution?.span_1) },
        { bucket: "2-5", count: num(traceDistribution?.span_2_5) },
        { bucket: "6-20", count: num(traceDistribution?.span_6_20) },
        { bucket: "21-100", count: num(traceDistribution?.span_21_100) },
        { bucket: "100+", count: num(traceDistribution?.span_100_plus) },
      ],
      durationHistogram: [
        { bucket: "<1s", count: num(traceDistribution?.duration_lt_1s) },
        { bucket: "1-5s", count: num(traceDistribution?.duration_1_5s) },
        { bucket: "5-30s", count: num(traceDistribution?.duration_5_30s) },
        { bucket: "30-120s", count: num(traceDistribution?.duration_30_120s) },
        { bucket: "120s+", count: num(traceDistribution?.duration_120s_plus) },
      ],
      largest: largestTraces,
    },
  };
}
