"use client";
import { formatCompact, formatExact, formatPct } from "~/lib/format";
import { cn } from "~/lib/utils";

export interface TokenSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * Horizontal stacked "token accounting" bar — a label-bearing replacement for
 * the cache-composition donut. Comparison of similarly sized slices and exact
 * values is easier on a stacked bar than on a donut, and the legend keeps every
 * number visible without hover.
 */
export function StackedTokenBar({
  segments,
  className,
}: {
  segments: TokenSegment[];
  className?: string;
}) {
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0);
  const visible = segments.filter((s) => s.value > 0);
  if (total <= 0 || visible.length === 0) return null;
  return (
    <div className={cn("space-y-3", className)}>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={visible
          .map((s) => `${s.label} ${formatPct(s.value / total)}`)
          .join(", ")}
      >
        {visible.map((s) => (
          <span
            key={s.label}
            className="h-full"
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${formatExact(s.value)} (${formatPct(s.value / total)})`}
          />
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {visible.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: s.color }}
              aria-hidden
            />
            <span className="truncate text-muted-foreground">{s.label}</span>
            <span className="ml-auto tabular-nums font-medium">
              {formatCompact(s.value)}
            </span>
            <span className="w-10 text-right tabular-nums text-muted-foreground">
              {formatPct(s.value / total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
