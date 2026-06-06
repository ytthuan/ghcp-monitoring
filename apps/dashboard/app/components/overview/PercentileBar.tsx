"use client";
import { formatCompact, formatMs } from "~/lib/format";
import { cn } from "~/lib/utils";

interface Marker {
  label: string;
  value: number;
  color: string;
  text: string;
}

/**
 * Renders p50 / p90 / p99 directly on a 0→p99 latency track so the tail shape
 * is visible at a glance, with exact values in a non-overlapping labeled row
 * beneath — positioned tick labels collide badly when p99 ≫ p50. Stays
 * readable in a static screenshot without hovering.
 */
export function PercentileBar({
  p50,
  p90,
  p99,
  count,
  className,
}: {
  p50: number;
  p90: number;
  p99: number;
  count: number;
  className?: string;
}) {
  const max = Math.max(p99, 1);
  const markers: Marker[] = [
    {
      label: "p50",
      value: p50,
      color: "hsl(var(--chart-2))",
      text: "text-emerald-700 dark:text-emerald-400",
    },
    {
      label: "p90",
      value: p90,
      color: "hsl(var(--chart-3))",
      text: "text-amber-700 dark:text-amber-400",
    },
    {
      label: "p99",
      value: p99,
      color: "hsl(var(--destructive))",
      text: "text-red-700 dark:text-red-400",
    },
  ];
  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative mt-1 h-2 w-full rounded-full bg-gradient-to-r from-emerald-500/25 via-amber-500/30 to-red-500/40">
        {markers.map((m) => {
          const pct = Math.min(100, Math.max(0, (m.value / max) * 100));
          return (
            <span
              key={m.label}
              className="absolute top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded"
              style={{ left: `${pct}%`, background: m.color }}
              aria-hidden
            />
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {markers.map((m) => (
          <div key={m.label} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: m.color }}
              aria-hidden
            />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {m.label}
            </span>
            <span className={cn("ml-auto text-xs font-semibold tabular-nums", m.text)}>
              {formatMs(m.value)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{formatCompact(count)} samples</p>
    </div>
  );
}
