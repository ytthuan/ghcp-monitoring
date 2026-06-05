import { z } from "zod";

export const TimeRange = z.enum(["1h", "6h", "24h", "7d", "30d", "custom"]);
export type TimeRange = z.infer<typeof TimeRange>;

export const Granularity = z.enum(["5m", "1h", "1d"]);
export type Granularity = z.infer<typeof Granularity>;

export const FiltersSchema = z.object({
  range: TimeRange.default("24h"),
  from: z.string().optional(),
  to: z.string().optional(),
  models: z.array(z.string()).default([]),
  agents: z.array(z.string()).default([]),
  granularity: Granularity.default("1h"),
});
export type Filters = z.infer<typeof FiltersSchema>;

export const TotalsRow = z.object({
  input: z.number(),
  output: z.number(),
  cache_read: z.number(),
  cache_create: z.number(),
  calls: z.number(),
  sessions: z.number(),
  // GitHub premium-request billing cost (AI Credits), summed over chat spans.
  copilot_cost: z.number().default(0),
  // How many chat calls actually carried a github.copilot.cost attribute, so
  // the UI can flag when the credits total is an undercount.
  copilot_cost_calls: z.number().default(0),
});
export type TotalsRow = z.infer<typeof TotalsRow>;

export const TrendPoint = z.object({
  bucket: z.string(),
  input: z.number(),
  output: z.number(),
  cache_read: z.number(),
  cache_create: z.number(),
  calls: z.number(),
});
export type TrendPoint = z.infer<typeof TrendPoint>;

export const ModelRow = z.object({
  request_model: z.string(),
  response_model: z.string(),
  input: z.number(),
  output: z.number(),
  cache_read: z.number(),
  cache_create: z.number(),
  calls: z.number(),
  total_duration_ns: z.number(),
  cost_input: z.number().nullable().default(null),
  cost_output: z.number().nullable().default(null),
  cost_cache_read: z.number().nullable().default(null),
  cost_cache_create: z.number().nullable().default(null),
  copilot_cost: z.number().default(0),
  is_internal: z.boolean().default(false),
});
export type ModelRow = z.infer<typeof ModelRow>;

export const AgentRow = z.object({
  agent_name: z.string(),
  input: z.number(),
  output: z.number(),
  calls: z.number(),
});
export type AgentRow = z.infer<typeof AgentRow>;

export const CallRow = z.object({
  trace_id: z.string(),
  span_id: z.string(),
  timestamp: z.string(),
  request_model: z.string(),
  response_model: z.string(),
  input: z.number(),
  output: z.number(),
  cache_read: z.number(),
  cache_create: z.number(),
  duration_ms: z.number(),
  finish_reasons: z.string(),
  agent_name: z.string(),
  conversation_id: z.string(),
  copilot_cost: z.number().default(0),
});
export type CallRow = z.infer<typeof CallRow>;

export const SessionRow = z.object({
  session_id: z.string(),
  start_ts: z.string(),
  end_ts: z.string(),
  calls: z.number(),
  input: z.number(),
  output: z.number(),
  models: z.array(z.string()),
});
export type SessionRow = z.infer<typeof SessionRow>;

export const HeatCell = z.object({
  dow: z.number(),
  hour: z.number(),
  input: z.number(),
  output: z.number(),
  calls: z.number(),
});
export type HeatCell = z.infer<typeof HeatCell>;

export const FinishRow = z.object({
  reason: z.string(),
  count: z.number(),
});
export type FinishRow = z.infer<typeof FinishRow>;

export const ToolRow = z.object({
  tool_name: z.string(),
  count: z.number(),
  error_count: z.number(),
  mean_ms: z.number(),
  p50_ms: z.number(),
  p90_ms: z.number(),
  p99_ms: z.number(),
  error_rate: z.number(),
  latest_at: z.string(),
});
export type ToolRow = z.infer<typeof ToolRow>;

export const LatencyRow = z.object({
  model: z.string(),
  p50_ms: z.number(),
  p90_ms: z.number(),
  p99_ms: z.number(),
  count: z.number(),
});
export type LatencyRow = z.infer<typeof LatencyRow>;

export const RevealedContent = z.object({
  input_messages: z.string().optional(),
  output_messages: z.string().optional(),
});
export type RevealedContent = z.infer<typeof RevealedContent>;
