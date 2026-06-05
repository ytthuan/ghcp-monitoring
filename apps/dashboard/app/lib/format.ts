const NUM = new Intl.NumberFormat("en-US");
// 2dp default — see polish-spec §13 "USD formatting".
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
// 4dp variant for tooltip / popover detail rows / CSV export. Kept in
// module scope so we don't allocate an Intl.NumberFormat per call.
const USD_EXACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const PCT = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});
const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export function formatNumber(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return NUM.format(n);
}

/**
 * formatUsd — canonical 2-decimal USD renderer for table cells, KPI tiles,
 * chart tooltips, and any other user-facing money surface. See polish-spec
 * §13 "USD formatting".
 *
 * Sub-cent guard: values in `(0, 0.005)` would round to `$0.00` at 2dp,
 * which is misleading (the cost is non-zero — we just can't show it at
 * cent resolution). We render `<$0.01` instead so the UI is honest about
 * precision loss; consumers that need the exact figure should pair this
 * with `formatUsdExact` in a tooltip / popover detail row.
 *
 * `0` (true zero) renders `$0.00`. `null` / `NaN` / `undefined` → `"—"`.
 */
export function formatUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n !== 0 && Math.abs(n) < 0.005) return "<$0.01";
  return USD.format(n);
}

/**
 * formatUsdExact — 4-decimal, thousand-separated USD for hover/title text,
 * popover detail rows, and CSV exports where sub-cent precision matters.
 * Same null/NaN handling as `formatUsd`. See polish-spec §13.
 */
export function formatUsdExact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return USD_EXACT.format(n);
}

export function formatMs(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1) return `${(n * 1000).toFixed(0)}µs`;
  if (n < 1000) return `${n.toFixed(0)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

/**
 * formatCredits — GitHub Copilot premium-request billing cost ("AI Credits",
 * from the `github.copilot.cost` span attribute). Values are unitless
 * multiplier credits (e.g. 1, 7.5, 15). Renders up to 2 decimals, trimming
 * trailing zeros, with a thousands separator. null/NaN → "—".
 */
const CREDITS = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
export function formatCredits(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return CREDITS.format(n);
}

export function formatPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return PCT.format(n);
}

export function nsToMs(ns: number | string | null | undefined): number {
  if (ns == null) return 0;
  const v = typeof ns === "string" ? Number(ns) : ns;
  return v / 1_000_000;
}

export function formatCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) < 1000) return String(Math.round(n));
  return COMPACT.format(n);
}

const COMPACT_BIG = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * formatExact — explicit alias of formatNumber for sites that want to
 * communicate "always full value with thousand separator" (tooltips,
 * popovers, CSV cells). Same null/NaN handling.
 */
export function formatExact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return NUM.format(n);
}

/**
 * formatCompactBig — like formatCompact but always uses K/M/B suffix
 * for values ≥ 1000 with 1 decimal place. Values under 1000 fall back
 * to a thousand-separated label so callers can still paste it into a
 * cell label without surprise.
 */
export function formatCompactBig(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) < 1000) return NUM.format(n);
  return COMPACT_BIG.format(n);
}

/**
 * formatTokens — opinionated picker for token counts in dense surfaces
 * (chart cells, KPI strip, sparkline labels). Compact at ≥10K, exact
 * with thousand separators below.
 */
export function formatTokens(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 10_000) return COMPACT_BIG.format(n);
  return NUM.format(n);
}

/**
 * formatRequests — opinionated picker for request / call counts in
 * dense surfaces. Compact at ≥1K, exact with thousand separators below.
 */
export function formatRequests(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1000) return COMPACT_BIG.format(n);
  return NUM.format(n);
}

/**
 * formatLatency — milliseconds, spec-compliant unit spacing (§8).
 *   < 1     -> "<1 ms"
 *   < 1000  -> "245 ms"
 *   ≥ 1000  -> "1.23 s"
 *   null/NaN -> "—"
 *
 * Note: existing `formatMs` renders "245ms" (no space) and is kept for
 * back-compat. New code should prefer `formatLatency`.
 */
export function formatLatency(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
