import { describe, expect, test } from "vitest";

import {
  additiveTokenTotal,
  cacheHitRatio,
  freshInputTokens,
} from "../../app/lib/token-math";
import { estimateCostBreakdown } from "../../app/server/pricing";

describe("token math", () => {
  test("treats cache-read tokens as a subset of input", () => {
    expect(freshInputTokens(100, 40)).toBe(60);
    expect(cacheHitRatio(100, 40)).toBeCloseTo(0.4);
    expect(
      additiveTokenTotal({ input: 100, output: 10, cache_create: 5 }),
    ).toBe(115);
  });

  test("splits fresh input and cache-read cost correctly", () => {
    const breakdown = estimateCostBreakdown({
      requestModel: "gpt-5.5",
      responseModel: "gpt-5.5",
      input: 100,
      output: 10,
      cache_read: 40,
      cache_create: 5,
    });

    expect(breakdown?.tokenBreakdown).toEqual({
      input: 60,
      output: 10,
      cache_read: 40,
      cache_create: 5,
    });
    expect(breakdown?.cost).toBeCloseTo(
      (60 * 5 + 10 * 15 + 40 * 0.5 + 5 * 6.25) / 1_000_000,
    );
  });
});
