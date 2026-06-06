import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { AnimatedNumber } from "./AnimatedNumber";

export function KpiCard({
  label,
  value,
  numericValue,
  format,
  delta,
  hint,
  tooltip,
  icon: Icon,
  accent,
  index = 0,
  className,
}: {
  label: string;
  /** Preformatted string value. Ignored when `numericValue` + `format` are set. */
  value?: string;
  /** Opt into a one-time count-up; requires `format`. */
  numericValue?: number;
  format?: (n: number) => string;
  delta?: number | null;
  hint?: string;
  tooltip?: string;
  icon?: LucideIcon;
  /** CSS color for the accent bar / hover sheen (defaults to brand). */
  accent?: string;
  /** Position in a strip — drives the staggered entrance delay. */
  index?: number;
  className?: string;
}) {
  const up = delta != null && delta > 0;
  const down = delta != null && delta < 0;
  const DeltaIcon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const deltaCls = up
    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
    : down
      ? "text-rose-600 dark:text-rose-400 bg-rose-500/10"
      : "text-muted-foreground bg-muted";

  const accentColor = accent ?? "hsl(var(--brand))";

  const inner =
    numericValue != null && format ? (
      <AnimatedNumber value={numericValue} format={format} />
    ) : (
      value
    );
  // A DOM element (not the AnimatedNumber component) is the Tooltip's asChild
  // target, so Radix's ref merge never lands on a refless function component.
  const valueNode = (
    <div className="w-fit max-w-full truncate text-2xl font-semibold tabular-nums">
      {inner}
    </div>
  );

  return (
    <Card
      className={cn(
        "group anim-enter-up card-interactive relative min-w-0 overflow-hidden",
        className,
      )}
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] opacity-70 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          backgroundImage: `linear-gradient(to bottom, ${accentColor}, transparent)`,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          backgroundImage: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
        }}
      />
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>{label}</CardTitle>
        {Icon ? (
          <Icon
            className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground"
            aria-hidden
          />
        ) : null}
      </CardHeader>
      <CardContent>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>{valueNode}</TooltipTrigger>
            <TooltipContent
              side="top"
              className="font-mono text-xs tabular-nums"
            >
              {tooltip}
            </TooltipContent>
          </Tooltip>
        ) : (
          valueNode
        )}
        <div className="mt-1 flex items-center gap-2 text-xs">
          {delta != null && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums",
                deltaCls,
              )}
            >
              <DeltaIcon className="h-3 w-3" aria-hidden />
              {(Math.abs(delta) * 100).toFixed(1)}%
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
