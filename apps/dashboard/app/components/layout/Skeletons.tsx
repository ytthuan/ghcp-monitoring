import * as React from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

/**
 * Shape-aware skeletons. Per polish-spec §6, these are the *only* approved
 * way to render a loading placeholder in route files — no fixed-pixel
 * `<Skeleton className="h-[400px]" />` at call sites.
 *
 * The underlying `<Skeleton />` primitive uses `animate-pulse`. We append
 * `motion-reduce:animate-none` everywhere to honor the accessibility floor
 * (spec §10): users who request reduced motion get a static block instead
 * of a pulse.
 */

const PULSE = "motion-reduce:animate-none";

export function TableSkeleton({
  rows = 8,
  cols,
  className,
  "data-testid": testId = "table-skeleton",
}: {
  rows?: number;
  cols: number;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      className={cn(
        "relative max-h-[70vh] overflow-hidden rounded-md border",
        className,
      )}
      data-testid={testId}
      role="status"
      aria-label="Loading table"
      aria-busy="true"
    >
      <div className="border-b bg-muted/40 px-2 py-2">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className={cn("h-4", PULSE)} />
          ))}
        </div>
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-2 py-2">
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: cols }).map((_, c) => (
                <Skeleton key={c} className={cn("h-4", PULSE)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton({
  height = 260,
  className,
  "data-testid": testId = "chart-skeleton",
}: {
  height?: number;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      className={cn("w-full", className)}
      style={{ height }}
      data-testid={testId}
      role="status"
      aria-label="Loading chart"
      aria-busy="true"
    >
      <Skeleton className={cn("h-full w-full rounded-md", PULSE)} />
    </div>
  );
}

export function KpiStripSkeleton({
  n = 4,
  className,
  "data-testid": testId = "kpi-strip-skeleton",
}: {
  n?: number;
  className?: string;
  "data-testid"?: string;
}) {
  // Mirror the layout used by `<MetricGroup cols={6}>` / `cols=4` so the
  // skeleton occupies the same grid as the real KPI strip.
  const gridCls =
    n >= 6
      ? "grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
      : n === 4
        ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        : n === 3
          ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          : "grid grid-cols-1 gap-3 sm:grid-cols-2";
  return (
    <div
      className={cn(gridCls, className)}
      data-testid={testId}
      role="status"
      aria-label="Loading metrics"
      aria-busy="true"
    >
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className={cn("h-28 rounded-lg", PULSE)} />
      ))}
    </div>
  );
}
