import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

export function KpiCard({
  label,
  value,
  delta,
  hint,
  tooltip,
  className,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  tooltip?: string;
  className?: string;
}) {
  const sign = delta == null ? null : delta > 0 ? "▲" : delta < 0 ? "▼" : "·";
  const deltaColor =
    delta == null
      ? ""
      : delta > 0
        ? "text-emerald-500"
        : delta < 0
          ? "text-rose-500"
          : "text-muted-foreground";
  const valueNode = (
    <div className="truncate text-2xl font-semibold tabular-nums">{value}</div>
  );
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="pb-2">
        <CardTitle>{label}</CardTitle>
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
          {sign && (
            <span className={deltaColor}>
              {sign} {delta != null ? `${(delta * 100).toFixed(1)}%` : ""}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
