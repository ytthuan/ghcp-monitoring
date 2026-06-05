// WCAG-AA palette mapping; deterministic by model name hash so colors are stable
// across renders and routes.
const PALETTE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(200 70% 45%)",
  "hsl(15 75% 55%)",
  "hsl(120 50% 40%)",
  "hsl(45 90% 50%)",
  "hsl(260 60% 55%)",
];

export function colorForModel(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length] ?? PALETTE[0]!;
}

/**
 * colorByIndex — non-colliding palette per slice index. Use this when
 * visual distinction WITHIN a single chart matters more than cross-chart
 * identity stability (donuts, single-chart bar charts).
 *
 * Strategy:
 *   - For i < PALETTE.length, pick PALETTE[i].
 *   - For i ≥ PALETTE.length, generate distinct HSL hues by golden-angle
 *     rotation so neighbors stay perceptually different.
 *
 * Pass `total` to optionally tune saturation/lightness for very small
 * palettes (≤3 slices look better at higher saturation).
 */
export function colorByIndex(i: number, total?: number): string {
  const idx = Math.max(0, Math.floor(i));
  if (idx < PALETTE.length) return PALETTE[idx]!;
  const hue = (idx * 137.508) % 360;
  const sat = total !== undefined && total <= 3 ? 75 : 65;
  return `hsl(${hue.toFixed(2)} ${sat}% 50%)`;
}

export const TOKEN_COLORS = {
  input: "hsl(var(--chart-1))",
  fresh_input: "hsl(var(--chart-1))",
  output: "hsl(var(--chart-2))",
  cache_read: "hsl(var(--chart-3))",
  cache_create: "hsl(var(--chart-4))",
} as const;
