/**
 * Pure, side-effect-free derivation of the overview "command strip" state and
 * "action queue" findings. Kept framework-free so it is unit-testable and so
 * the route component stays a thin presenter.
 *
 * Thresholds are intentionally conservative and every finding carries an
 * explicit evidence string with the underlying numbers, so the operator can
 * judge severity rather than trusting an opaque rule.
 */
import { formatCompact, formatMs, formatPct, formatUsd } from "./format";

/** Routes the action queue / command strip can deep-link into. */
export type DetailRoute =
  | "/trends"
  | "/models"
  | "/cache"
  | "/latency"
  | "/ttft"
  | "/traces"
  | "/tools"
  | "/agents"
  | "/sessions"
  | "/heatmap"
  | "/finish";

export type Severity = "critical" | "warning" | "info" | "ok";

export interface ActionItem {
  id: string;
  severity: Severity;
  title: string;
  evidence: string;
  to?: DetailRoute;
}

export type IngestState = "live" | "recent" | "stale" | "nodata";

export interface FreshnessInput {
  lastSpanAt: string | null;
  secondsSinceLastSpan: number | null;
  spansLast5m: number;
}

export interface OverviewSignalInput {
  totals: {
    calls: number;
    copilot_cost: number;
    copilot_cost_calls: number;
  };
  cost: { total: number; unknownModels: number };
  /** Already-normalized cache_read / input ratio (0..1). */
  cacheHitRatio: number;
  inputTokens: number;
  cacheReadTokens: number;
  latency: { p50: number; p90: number; p99: number; calls: number };
  cacheSavings: { coverage: number; totalCacheRead: number };
  traceErrors: number;
  freshness: FreshnessInput | null;
  revealActive: boolean;
}

// Tunable, transparent thresholds. Evidence text always restates the numbers.
export const THRESHOLDS = {
  /** Cache hit below this is flagged as a warning. */
  cacheHitWarn: 0.5,
  /** Cache hit below this escalates the warning copy. */
  cacheHitLow: 0.3,
  /** Chat p99 at/above this (ms) is flagged as slow. */
  latencyP99WarnMs: 30_000,
  /** p99/p50 at/above this is flagged as a heavy tail (when p99 is non-trivial). */
  latencyTailRatio: 6,
  /** Min ms for the tail-ratio rule to fire, to avoid noise on fast calls. */
  latencyTailMinMs: 5_000,
  /** Seconds since last span at/above this → "stale" ingest. */
  ingestStaleSec: 900,
  /** Seconds since last span at/above this → "recent" (amber) ingest. */
  ingestRecentSec: 120,
  /** Cache-savings coverage below this is reported as partial. */
  savingsCoverageMin: 0.8,
} as const;

export interface CommandStripState {
  ingest: {
    state: IngestState;
    label: string;
    detail: string;
  };
  pricing: {
    ok: boolean;
    label: string;
    detail: string;
  };
  reveal: {
    revealed: boolean;
    label: string;
    detail: string;
  };
  /** Count of warning+critical action items. */
  warnings: number;
}

function ingestState(freshness: FreshnessInput | null): IngestState {
  if (!freshness || freshness.lastSpanAt == null) return "nodata";
  const secs = freshness.secondsSinceLastSpan;
  if (secs == null) return "nodata";
  if (secs >= THRESHOLDS.ingestStaleSec) return "stale";
  if (secs >= THRESHOLDS.ingestRecentSec) return "recent";
  return "live";
}

function relativeAge(secs: number | null): string {
  if (secs == null) return "no data";
  if (secs < 60) return `${Math.max(0, secs)}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function deriveCommandStrip(input: OverviewSignalInput): CommandStripState {
  const state = ingestState(input.freshness);
  const secs = input.freshness?.secondsSinceLastSpan ?? null;
  const spans5m = input.freshness?.spansLast5m ?? 0;
  const ingestLabel =
    state === "live"
      ? "Live"
      : state === "recent"
        ? "Quiet"
        : state === "stale"
          ? "Stale"
          : "No data";
  const ingestDetail =
    state === "nodata"
      ? "No spans ingested yet"
      : `Last span ${relativeAge(secs)} · ${formatCompact(spans5m)} in 5m`;

  const unpriced = input.cost.unknownModels;
  const pricingOk = unpriced === 0;

  const warnings = deriveActionItems(input).filter(
    (a) => a.severity === "warning" || a.severity === "critical",
  ).length;

  return {
    ingest: { state, label: ingestLabel, detail: ingestDetail },
    pricing: {
      ok: pricingOk,
      label: pricingOk ? "Pricing complete" : `${unpriced} unpriced`,
      detail: pricingOk
        ? "All active models have known pricing"
        : `${unpriced} model${unpriced === 1 ? "" : "s"} lack pricing — cost is an undercount`,
    },
    reveal: {
      revealed: input.revealActive,
      label: input.revealActive ? "Content revealed" : "Content redacted",
      detail: input.revealActive
        ? "Captured prompt/response content is unmasked in this tab"
        : "Captured content is masked by default",
    },
    warnings,
  };
}

/**
 * Build the prioritized action queue. Items are returned already sorted by
 * severity (critical → warning → info), then by insertion order.
 */
export function deriveActionItems(input: OverviewSignalInput): ActionItem[] {
  const items: ActionItem[] = [];
  const { freshness } = input;

  // 1. Ingest health.
  const ingest = ingestState(freshness);
  if (ingest === "nodata") {
    items.push({
      id: "ingest-nodata",
      severity: "critical",
      title: "No telemetry is being ingested",
      evidence:
        "ClickHouse has no spans. Check the OTel collector and that Copilot telemetry env vars are set.",
      to: "/traces",
    });
  } else if (ingest === "stale") {
    items.push({
      id: "ingest-stale",
      severity: "warning",
      title: "Ingest looks stale",
      evidence: `Last span ${relativeAge(freshness?.secondsSinceLastSpan ?? null)}, ${formatCompact(
        freshness?.spansLast5m ?? 0,
      )} in the last 5m. Pipeline may have stopped.`,
      to: "/traces",
    });
  } else if ((freshness?.spansLast5m ?? 0) === 0 && ingest === "recent") {
    items.push({
      id: "ingest-quiet",
      severity: "info",
      title: "No spans in the last 5 minutes",
      evidence: `Backend is reachable; last span ${relativeAge(
        freshness?.secondsSinceLastSpan ?? null,
      )}. Expected if Copilot is idle.`,
      to: "/traces",
    });
  }

  // 2. Unknown model pricing → cost undercount.
  if (input.cost.unknownModels > 0) {
    items.push({
      id: "pricing-unknown",
      severity: "warning",
      title: "Some models have no pricing",
      evidence: `${input.cost.unknownModels} model${
        input.cost.unknownModels === 1 ? "" : "s"
      } lack pricing — estimated cost (${formatUsd(input.cost.total)}) is a lower bound.`,
      to: "/models",
    });
  }

  // 3. Cache hit below target.
  if (input.inputTokens > 0 && input.cacheHitRatio < THRESHOLDS.cacheHitWarn) {
    const low = input.cacheHitRatio < THRESHOLDS.cacheHitLow;
    items.push({
      id: "cache-low",
      severity: low ? "warning" : "info",
      title: low ? "Cache hit rate is low" : "Cache hit rate below target",
      evidence: `${formatPct(input.cacheHitRatio)} of prompt input served from cache (${formatCompact(
        input.cacheReadTokens,
      )}/${formatCompact(input.inputTokens)}). Target ≥ ${formatPct(
        THRESHOLDS.cacheHitWarn,
      )}.`,
      to: "/cache",
    });
  }

  // 4. Latency: absolute slow p99, or heavy tail.
  if (input.latency.calls > 0) {
    const { p50, p99 } = input.latency;
    if (p99 >= THRESHOLDS.latencyP99WarnMs) {
      items.push({
        id: "latency-p99",
        severity: "warning",
        title: "Chat p99 latency is high",
        evidence: `p99 ${formatMs(p99)} across ${formatCompact(
          input.latency.calls,
        )} calls (p50 ${formatMs(p50)}).`,
        to: "/latency",
      });
    } else if (
      p50 > 0 &&
      p99 >= THRESHOLDS.latencyTailMinMs &&
      p99 / p50 >= THRESHOLDS.latencyTailRatio
    ) {
      items.push({
        id: "latency-tail",
        severity: "info",
        title: "Chat latency has a heavy tail",
        evidence: `p99 ${formatMs(p99)} is ${(p99 / p50).toFixed(1)}× the p50 (${formatMs(
          p50,
        )}).`,
        to: "/latency",
      });
    }
  }

  // 5. Trace errors.
  if (input.traceErrors > 0) {
    items.push({
      id: "trace-errors",
      severity: "warning",
      title: "Errors in recent large traces",
      evidence: `${formatCompact(input.traceErrors)} error span${
        input.traceErrors === 1 ? "" : "s"
      } across the largest traces in this window.`,
      to: "/traces",
    });
  }

  // 6. Partial cache-savings pricing coverage.
  if (
    input.cacheSavings.totalCacheRead > 0 &&
    input.cacheSavings.coverage < THRESHOLDS.savingsCoverageMin
  ) {
    items.push({
      id: "savings-coverage",
      severity: "info",
      title: "Cache savings estimate is partial",
      evidence: `Only ${formatPct(
        input.cacheSavings.coverage,
      )} of cache-read tokens have explicit cache pricing.`,
      to: "/cache",
    });
  }

  // 7. Copilot AI-credit coverage gap.
  if (
    input.totals.calls > 0 &&
    input.totals.copilot_cost_calls < input.totals.calls
  ) {
    items.push({
      id: "credits-partial",
      severity: "info",
      title: "AI credits reported on a subset of calls",
      evidence: `github.copilot.cost seen on ${formatCompact(
        input.totals.copilot_cost_calls,
      )}/${formatCompact(input.totals.calls)} calls — credit total may be an undercount.`,
      to: "/models",
    });
  }

  // 8. Content reveal posture.
  if (input.revealActive) {
    items.push({
      id: "reveal-active",
      severity: "info",
      title: "Captured content is revealed in this tab",
      evidence:
        "Prompt/response content is unmasked. Lock it from the banner before sharing your screen.",
    });
  }

  const rank: Record<Severity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    ok: 3,
  };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
