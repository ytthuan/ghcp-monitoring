import { describe, expect, test } from "vitest";

import {
  deriveActionItems,
  deriveCommandStrip,
  THRESHOLDS,
  type OverviewSignalInput,
} from "../../app/lib/overview-signals";

function baseInput(over: Partial<OverviewSignalInput> = {}): OverviewSignalInput {
  return {
    totals: { calls: 100, copilot_cost: 50, copilot_cost_calls: 100 },
    cost: { total: 12.34, unknownModels: 0 },
    cacheHitRatio: 0.8,
    inputTokens: 1_000_000,
    cacheReadTokens: 800_000,
    latency: { p50: 1_000, p90: 2_000, p99: 4_000, calls: 100 },
    cacheSavings: { coverage: 1, totalCacheRead: 800_000 },
    traceErrors: 0,
    freshness: { lastSpanAt: "2026-06-06T00:00:00Z", secondsSinceLastSpan: 10, spansLast5m: 42 },
    revealActive: false,
    ...over,
  };
}

describe("overview signals — command strip", () => {
  test("reports live ingest, complete pricing, redacted content when healthy", () => {
    const strip = deriveCommandStrip(baseInput());
    expect(strip.ingest.state).toBe("live");
    expect(strip.pricing.ok).toBe(true);
    expect(strip.reveal.revealed).toBe(false);
    expect(strip.warnings).toBe(0);
  });

  test("flags stale ingest and counts warnings", () => {
    const strip = deriveCommandStrip(
      baseInput({
        freshness: {
          lastSpanAt: "2026-06-05T00:00:00Z",
          secondsSinceLastSpan: THRESHOLDS.ingestStaleSec + 1,
          spansLast5m: 0,
        },
      }),
    );
    expect(strip.ingest.state).toBe("stale");
    expect(strip.warnings).toBeGreaterThanOrEqual(1);
  });

  test("nodata ingest when there is no last span", () => {
    const strip = deriveCommandStrip(
      baseInput({ freshness: { lastSpanAt: null, secondsSinceLastSpan: null, spansLast5m: 0 } }),
    );
    expect(strip.ingest.state).toBe("nodata");
  });

  test("surfaces unpriced-model count in the pricing cell", () => {
    const strip = deriveCommandStrip(baseInput({ cost: { total: 5, unknownModels: 3 } }));
    expect(strip.pricing.ok).toBe(false);
    expect(strip.pricing.label).toContain("3");
  });
});

describe("overview signals — action queue", () => {
  test("healthy input produces no findings", () => {
    expect(deriveActionItems(baseInput())).toHaveLength(0);
  });

  test("low cache hit produces a warning with explicit numbers", () => {
    const items = deriveActionItems(baseInput({ cacheHitRatio: 0.2 }));
    const cache = items.find((i) => i.id === "cache-low");
    expect(cache?.severity).toBe("warning");
    expect(cache?.to).toBe("/cache");
    expect(cache?.evidence).toMatch(/%/);
  });

  test("cache hit between low and warn thresholds is info severity", () => {
    const items = deriveActionItems(baseInput({ cacheHitRatio: 0.4 }));
    expect(items.find((i) => i.id === "cache-low")?.severity).toBe("info");
  });

  test("unknown pricing yields a cost-undercount warning", () => {
    const items = deriveActionItems(baseInput({ cost: { total: 9, unknownModels: 2 } }));
    expect(items.find((i) => i.id === "pricing-unknown")?.severity).toBe("warning");
  });

  test("high p99 latency is flagged", () => {
    const items = deriveActionItems(
      baseInput({ latency: { p50: 2_000, p90: 20_000, p99: 40_000, calls: 50 } }),
    );
    expect(items.find((i) => i.id === "latency-p99")?.severity).toBe("warning");
  });

  test("heavy tail is flagged as info when p99 is non-trivial but below the absolute cap", () => {
    const items = deriveActionItems(
      baseInput({ latency: { p50: 1_000, p90: 5_000, p99: 9_000, calls: 50 } }),
    );
    expect(items.find((i) => i.id === "latency-tail")?.severity).toBe("info");
  });

  test("no telemetry is critical", () => {
    const items = deriveActionItems(
      baseInput({ freshness: { lastSpanAt: null, secondsSinceLastSpan: null, spansLast5m: 0 } }),
    );
    expect(items[0]?.severity).toBe("critical");
    expect(items[0]?.id).toBe("ingest-nodata");
  });

  test("reveal-active appends an info finding", () => {
    const items = deriveActionItems(baseInput({ revealActive: true }));
    expect(items.find((i) => i.id === "reveal-active")?.severity).toBe("info");
  });

  test("items are sorted critical → warning → info", () => {
    const items = deriveActionItems(
      baseInput({
        cost: { total: 9, unknownModels: 1 }, // warning
        cacheHitRatio: 0.4, // info
        revealActive: true, // info
        freshness: { lastSpanAt: null, secondsSinceLastSpan: null, spansLast5m: 0 }, // critical
      }),
    );
    const severities = items.map((i) => i.severity);
    const rank = { critical: 0, warning: 1, info: 2, ok: 3 } as const;
    for (let i = 1; i < severities.length; i += 1) {
      expect(rank[severities[i]!]).toBeGreaterThanOrEqual(rank[severities[i - 1]!]);
    }
  });
});
