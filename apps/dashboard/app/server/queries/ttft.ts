import { query } from "../clickhouse";
import { normalizeModelExpr } from "../filters";
import type { Filters, LatencyRow } from "../../lib/types";

const RANGE_TO_SECONDS: Record<string, number> = {
  "1h": 3_600,
  "6h": 21_600,
  "24h": 86_400,
  "7d": 604_800,
  "30d": 2_592_000,
};

/**
 * TTFT quantiles, derived from the `gen_ai.server.time_to_first_token`
 * histogram metric. Returns an empty array if the metric isn't being emitted —
 * the route renders an EmptyState explaining how to enable it.
 */
export async function getTtftByModel(filters: Filters): Promise<LatencyRow[]> {
  const seconds = RANGE_TO_SECONDS[filters.range] ?? 86_400;
  // Histograms in the OTel ClickHouse exporter store quantile samples in
  // separate columns when configured, but the safe path is to compute from
  // Sum/Count and BucketCounts/ExplicitBounds. We approximate quantiles by
  // walking the bucket counts.
  const sql = `
    SELECT
      ${normalizeModelExpr("Attributes['gen_ai.response.model']")} AS model,
      sum(Sum) / nullIf(sum(Count), 0)    AS mean,
      sum(Count)                          AS count,
      groupArrayArray(BucketCounts)       AS buckets,
      any(ExplicitBounds)                 AS bounds
    FROM otel_metrics_histogram
    WHERE MetricName = 'gen_ai.server.time_to_first_token'
      AND TimeUnix >= now() - INTERVAL {seconds:UInt32} SECOND
      ${filters.models.length > 0 ? `AND ${normalizeModelExpr("Attributes['gen_ai.response.model']")} IN {models:Array(String)}` : ""}
    GROUP BY model
    ORDER BY count DESC
    LIMIT 25
  `;
  let rows: Array<{
    model: string;
    mean: number;
    count: number;
    buckets: number[];
    bounds: number[];
  }>;
  try {
    rows = await query<{
      model: string;
      mean: number;
      count: number;
      buckets: number[];
      bounds: number[];
    }>(sql, { seconds, models: filters.models });
  } catch {
    return [];
  }

  return rows.map((r) => {
    const total = Number(r.count ?? 0);
    const bounds = r.bounds ?? [];
    const buckets = r.buckets ?? [];
    const q = (p: number): number => {
      if (total === 0 || bounds.length === 0) return 0;
      const target = p * total;
      let cum = 0;
      for (let i = 0; i < bounds.length; i += 1) {
        cum += Number(buckets[i] ?? 0);
        if (cum >= target) return Number(bounds[i] ?? 0) * 1000;
      }
      return Number(bounds[bounds.length - 1] ?? 0) * 1000;
    };
    return {
      model: r.model || "unknown",
      p50_ms: q(0.5),
      p90_ms: q(0.9),
      p99_ms: q(0.99),
      count: total,
    };
  });
}
