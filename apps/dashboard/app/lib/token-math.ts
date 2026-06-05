const MISSING_VALUE = 0;

function nonNegative(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return MISSING_VALUE;
  return Math.max(0, value);
}

export function normalizeCacheReadTokens(
  input: number | null | undefined,
  cacheRead: number | null | undefined,
): number {
  return Math.min(nonNegative(cacheRead), nonNegative(input));
}

export function freshInputTokens(
  input: number | null | undefined,
  cacheRead: number | null | undefined,
): number {
  return nonNegative(input) - normalizeCacheReadTokens(input, cacheRead);
}

export function cacheHitRatio(
  input: number | null | undefined,
  cacheRead: number | null | undefined,
): number {
  const totalInput = nonNegative(input);
  if (totalInput <= 0) return 0;
  return normalizeCacheReadTokens(input, cacheRead) / totalInput;
}

export function additiveTokenTotal(args: {
  input: number | null | undefined;
  output: number | null | undefined;
  cache_create: number | null | undefined;
  reasoning?: number | null | undefined;
}): number {
  return (
    nonNegative(args.input) +
    nonNegative(args.output) +
    nonNegative(args.cache_create) +
    nonNegative(args.reasoning)
  );
}
