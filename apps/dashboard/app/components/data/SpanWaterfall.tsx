"use client";
/**
 * Renders a depth-indented span waterfall for a single trace. Bars are
 * positioned with bigint nanosecond math; only the final ratio is converted
 * to Number so we never lose precision on long traces.
 */
import { useMemo, useState } from "react";
import type { SpanRow } from "~/server/queries/traces";
import { SpanDetailDialog } from "./SpanDetailDialog";

export interface SpanWaterfallProps {
  spans: SpanRow[];
  /** Substring filter on span_name (case-insensitive). Empty = no filter. */
  search?: string;
  /** When true, only show spans with status_code === "STATUS_CODE_ERROR". */
  errorsOnly?: boolean;
}

interface FlatRow {
  span: SpanRow;
  depth: number;
  leftPct: number;
  widthPct: number;
}

function colorFor(spanName: string): string {
  if (spanName.startsWith("chat")) return "hsl(var(--chart-1))";
  if (spanName.startsWith("execute_tool")) return "hsl(var(--chart-2))";
  if (spanName.startsWith("invoke_agent")) return "hsl(var(--chart-4))";
  if (spanName === "permission") return "hsl(var(--chart-3))";
  if (spanName === "elicitation") return "hsl(var(--chart-5))";
  return "hsl(var(--muted-foreground))";
}

function flatten(
  spans: SpanRow[],
  bounds?: { traceStart: bigint; traceDuration: bigint },
): {
  rows: FlatRow[];
  traceStart: bigint;
  traceDuration: bigint;
} {
  if (spans.length === 0) {
    return {
      rows: [],
      traceStart: bounds?.traceStart ?? 0n,
      traceDuration: bounds?.traceDuration ?? 0n,
    };
  }
  // Compute trace bounds (or reuse externally-provided bounds so the ruler
  // stays anchored to the unfiltered trace).
  let traceStart: bigint;
  let traceDuration: bigint;
  if (bounds) {
    traceStart = bounds.traceStart;
    traceDuration = bounds.traceDuration;
  } else {
    traceStart = BigInt(spans[0]!.started_at_ns);
    let traceEnd = traceStart + BigInt(spans[0]!.duration_ns);
    for (const s of spans) {
      const start = BigInt(s.started_at_ns);
      const end = start + BigInt(s.duration_ns);
      if (start < traceStart) traceStart = start;
      if (end > traceEnd) traceEnd = end;
    }
    traceDuration = traceEnd - traceStart;
  }
  if (traceDuration <= 0n) traceDuration = 1n;

  // Build parent map; treat orphans (parent not in slice) as roots.
  const ids = new Set(spans.map((s) => s.span_id));
  const childrenOf = new Map<string, SpanRow[]>();
  const roots: SpanRow[] = [];
  for (const s of spans) {
    const pid = s.parent_span_id;
    if (!pid || !ids.has(pid)) {
      roots.push(s);
    } else {
      const arr = childrenOf.get(pid) ?? [];
      arr.push(s);
      childrenOf.set(pid, arr);
    }
  }
  // Stable sort by start time (ASC).
  const byStart = (a: SpanRow, b: SpanRow): number => {
    const av = BigInt(a.started_at_ns);
    const bv = BigInt(b.started_at_ns);
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  };
  roots.sort(byStart);
  for (const arr of childrenOf.values()) arr.sort(byStart);

  const out: FlatRow[] = [];
  const visit = (s: SpanRow, depth: number): void => {
    const start = BigInt(s.started_at_ns);
    const dur = BigInt(s.duration_ns);
    // Multiply by 10000 then divide for 2 decimal places of precision via int math.
    const leftPct =
      Number(((start - traceStart) * 10000n) / traceDuration) / 100;
    const widthPct = Number((dur * 10000n) / traceDuration) / 100;
    out.push({ span: s, depth, leftPct, widthPct });
    const kids = childrenOf.get(s.span_id);
    if (kids) for (const k of kids) visit(k, depth + 1);
  };
  for (const r of roots) visit(r, 0);
  return { rows: out, traceStart, traceDuration };
}

export function SpanWaterfall({
  spans,
  search,
  errorsOnly,
}: SpanWaterfallProps) {
  const [selected, setSelected] = useState<SpanRow | null>(null);

  // Compute trace bounds from the unfiltered spans so the ruler is stable
  // regardless of the active filter.
  const fullBounds = useMemo(() => {
    const { traceStart, traceDuration } = flatten(spans);
    return { traceStart, traceDuration };
  }, [spans]);

  const filtered = useMemo(() => {
    let out = spans;
    if (errorsOnly) {
      out = out.filter((s) => s.status_code === "STATUS_CODE_ERROR");
    }
    if (search) {
      const needle = search.toLowerCase();
      out = out.filter((s) => s.span_name.toLowerCase().includes(needle));
    }
    return out;
  }, [spans, search, errorsOnly]);

  const { rows, traceDuration } = useMemo(
    () => flatten(filtered, fullBounds),
    [filtered, fullBounds],
  );

  const totalMs = Number(traceDuration / 1_000_000n);
  const tickLabels = [
    { pct: 0, label: "0ms" },
    { pct: 25, label: `${Math.round(totalMs * 0.25)}ms` },
    { pct: 50, label: `${Math.round(totalMs * 0.5)}ms` },
    { pct: 75, label: `${Math.round(totalMs * 0.75)}ms` },
    { pct: 100, label: `${totalMs}ms` },
  ];

  return (
    <div className="space-y-0.5">
      <div className="sticky top-0 z-10 mb-2 grid grid-cols-[minmax(0,1fr)_320px] gap-2 border-b bg-card pb-2">
        <div />
        <div className="relative h-4 text-[10px] text-muted-foreground">
          {tickLabels.map((t) => (
            <span
              key={t.pct}
              className="absolute"
              style={{
                left: `${t.pct}%`,
                transform:
                  t.pct === 0
                    ? "translateX(0)"
                    : t.pct === 100
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
      {rows.map(({ span, depth, leftPct, widthPct }) => {
        const ms = Number(BigInt(span.duration_ns) / 1_000_000n);
        const backgroundColor = colorFor(span.span_name);
        const isError = span.status_code === "STATUS_CODE_ERROR";
        // Tooltip MUST NOT include status_message (may carry user
        // content). Only the literal "Error" + span name, matching the
        // ErrorBoundary's redaction stance.
        const errorTitle = isError ? `Error — ${span.span_name}` : undefined;
        return (
          <button
            key={span.span_id}
            type="button"
            className={
              "grid w-full grid-cols-[minmax(0,1fr)_320px] items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent hover:ring-1 hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" +
              (isError
                ? " bg-destructive/10 ring-1 ring-destructive/40"
                : "")
            }
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => setSelected(span)}
            title={errorTitle}
            aria-label={`View span details for ${span.span_name} (${ms} ms)${isError ? " — error" : ""}`}
          >
            <span className="flex items-center gap-1.5 truncate">
              <span
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor }}
                aria-hidden
              />
              <span
                className="truncate font-mono text-xs"
                title={span.span_name}
              >
                {span.span_name}
                {isError && (
                  <span
                    className="ml-1 text-destructive"
                    aria-label="error"
                  >
                    ●
                  </span>
                )}
              </span>
            </span>
            <div className="relative h-4 rounded bg-muted/50">
              <div
                className={
                  "absolute h-4 rounded" +
                  (isError ? " ring-1 ring-destructive/60" : "")
                }
                style={{
                  left: `${leftPct}%`,
                  width: `${Math.max(widthPct, 0.5)}%`,
                  backgroundColor: isError
                    ? "hsl(var(--destructive))"
                    : backgroundColor,
                }}
              />
              {widthPct >= 15 ? (
                <span
                  className="absolute top-0 px-1 text-[10px] leading-4 tabular-nums text-white drop-shadow"
                  style={{ left: `${leftPct}%` }}
                >
                  {ms}ms
                </span>
              ) : (
                <span
                  className="absolute top-0 text-[10px] leading-4 tabular-nums text-muted-foreground"
                  style={{
                    left: `${Math.min(leftPct + widthPct + 0.5, 99)}%`,
                  }}
                >
                  {ms}ms
                </span>
              )}
            </div>
          </button>
        );
      })}
      {filtered.length === 0 && spans.length > 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          No spans match the current filter.
        </p>
      )}
      <SpanDetailDialog
        span={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
