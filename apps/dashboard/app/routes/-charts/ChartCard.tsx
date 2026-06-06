import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { formatPct } from "~/lib/format";
import { cn } from "~/lib/utils";

/**
 * Shared "filter-aware chart page" pattern (Wave 3 polish-charts).
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ eyebrow        ┌──────── eyebrow stat ─────┐  drilldown │
 *   │ title (?)      │ big number                │  →         │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ chart                          │ side panel              │
 *   └──────────────────────────────────────────────────────────┘
 */
export type DrillRoute = "/calls" | "/traces";

export function ChartCard({
  eyebrow,
  title,
  whatThisMeasures,
  stat,
  statLabel,
  drillTo,
  drillLabel,
  chart,
  side,
  testId,
}: {
  eyebrow?: string;
  title: string;
  whatThisMeasures: string;
  stat?: React.ReactNode;
  statLabel?: string;
  drillTo?: DrillRoute;
  drillLabel?: string;
  chart: React.ReactNode;
  side?: React.ReactNode;
  testId?: string;
}) {
  return (
    <Card data-testid={testId ?? "chart-card"} className="card-interactive">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          {eyebrow ? (
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-foreground">{title}</CardTitle>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  aria-label="What this measures"
                  data-testid="chart-help"
                  className={cn(
                    "inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                >
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {whatThisMeasures}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {stat !== undefined ? (
            <div
              className="text-2xl font-semibold tabular-nums text-foreground"
              data-testid="chart-eyebrow-stat"
              aria-label={statLabel}
            >
              {stat}
            </div>
          ) : null}
        </div>
        {drillTo ? (
          <Link
            to={drillTo}
            search={(prev) => prev}
            data-testid="chart-drilldown"
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            {drillLabel ?? "View calls with this filter"}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        <div
          className={cn(
            "grid gap-6",
            side ? "lg:grid-cols-[minmax(0,1fr)_240px]" : "grid-cols-1",
          )}
        >
          <div className="anim-enter min-w-0">{chart}</div>
          {side ? (
            <aside
              className="space-y-4 lg:border-l lg:pl-6"
              aria-label="Chart summary"
              data-testid="chart-side-panel"
            >
              {side}
            </aside>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function SidePanelSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {heading}
      </div>
      {children}
    </section>
  );
}

export function QuickStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  const node = (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
  if (!hint) return node;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help">{node}</div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export interface LegendItem {
  key: string;
  label: string;
  value: number;
  share: number; // 0..1
}

export function LegendList({
  items,
  formatValue,
  emptyText = "No items",
  max = 6,
}: {
  items: LegendItem[];
  formatValue?: (n: number) => string;
  emptyText?: string;
  max?: number;
}) {
  const top = items.slice(0, max);
  if (top.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{emptyText}</p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {top.map((it) => (
        <li key={it.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-foreground" title={it.label}>
              {it.label}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatValue ? formatValue(it.value) : it.value}
              {" · "}
              {formatPct(it.share)}
            </span>
          </div>
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-muted"
            aria-hidden
          >
            <div
              className="h-full rounded-full bg-chart-1"
              style={{ width: `${Math.max(2, Math.min(100, it.share * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
