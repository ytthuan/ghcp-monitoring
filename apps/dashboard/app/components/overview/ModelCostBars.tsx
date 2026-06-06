"use client";
import { InternalModelBadge } from "~/components/data/InternalModelBadge";
import { formatPct, formatUsd, formatUsdExact } from "~/lib/format";
import { colorByIndex } from "~/lib/colors";
import { cn } from "~/lib/utils";

export interface ModelCostRow {
  model: string;
  cost: number;
}

/**
 * Model spend as a table with embedded proportional bars and exact values — a
 * replacement for the model cost-share donut. Bars give the at-a-glance
 * comparison a donut offers; the numeric columns give the exact spend and share
 * a donut hides behind hover, and long model names stay readable.
 */
export function ModelCostBars({
  rows,
  className,
}: {
  rows: ModelCostRow[];
  className?: string;
}) {
  const sorted = [...rows].sort((a, b) => b.cost - a.cost);
  const total = sorted.reduce((s, r) => s + Math.max(0, r.cost), 0);
  const max = sorted.reduce((m, r) => Math.max(m, r.cost), 0);
  if (sorted.length === 0 || total <= 0) return null;
  return (
    <ul className={cn("space-y-2", className)}>
      {sorted.map((r, i) => {
        const share = total > 0 ? r.cost / total : 0;
        const width = max > 0 ? (r.cost / max) * 100 : 0;
        return (
          <li key={r.model} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-mono" title={r.model}>
                  {r.model}
                </span>
                <InternalModelBadge model={r.model} variant="pill" />
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-medium" title={formatUsdExact(r.cost)}>
                  {formatUsd(r.cost)}
                </span>
                <span className="ml-1.5 text-muted-foreground">
                  {formatPct(share)}
                </span>
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${r.model}: ${formatUsd(r.cost)}, ${formatPct(share)} of spend`}
            >
              <span
                className="block h-full rounded-full"
                style={{ width: `${width}%`, background: colorByIndex(i, sorted.length) }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
