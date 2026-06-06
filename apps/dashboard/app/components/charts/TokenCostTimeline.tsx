"use client";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { ChartContainer, type ChartConfig } from "~/components/ui/chart";
import { TOKEN_COLORS } from "~/lib/colors";
import { formatCompact, formatUsd, formatExact } from "~/lib/format";
import { formatHourLabelInTz } from "~/lib/use-timezone";
import { cn } from "~/lib/utils";

export interface TokenCostPoint {
  bucket: string;
  fresh_input: number;
  cache_read: number;
  output: number;
  cache_create: number;
  cost: number;
}

const COST_COLOR = "hsl(var(--foreground))";

const BANDS: ReadonlyArray<{ key: keyof TokenCostPoint; label: string; color: string }> = [
  { key: "fresh_input", label: "Fresh input", color: TOKEN_COLORS.fresh_input },
  { key: "cache_read", label: "Cache read", color: TOKEN_COLORS.cache_read },
  { key: "output", label: "Output", color: TOKEN_COLORS.output },
  { key: "cache_create", label: "Cache create", color: TOKEN_COLORS.cache_create },
];

/** Show roughly six time anchors even for a dense series, instead of hiding the axis. */
function tickInterval(n: number, target = 6): number {
  if (n <= target) return 0;
  return Math.max(0, Math.ceil(n / target) - 1);
}

/**
 * Coordinated token + cost timeline. Stacked token bands share the left axis;
 * estimated cost rides a second right axis as a bold line so the page tells one
 * story (volume → spend) instead of three separate panels. The legend restates
 * the latest value of every series so the main takeaway survives a screenshot
 * without hovering.
 */
export function TokenCostTimeline({
  data,
  tz = "UTC",
  className,
}: {
  data: TokenCostPoint[];
  tz?: string;
  className?: string;
}) {
  const config: ChartConfig = Object.fromEntries([
    ...BANDS.map((b) => [b.key, { label: b.label, color: b.color }]),
    ["cost", { label: "Est. cost", color: COST_COLOR }],
  ]);
  const latest = data.at(-1);
  const interval = tickInterval(data.length);

  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" aria-hidden>
        {BANDS.map((b) => (
          <li key={b.key} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-[2px]"
              style={{ background: b.color }}
            />
            <span className="text-muted-foreground">{b.label}</span>
            <span className="font-medium tabular-nums">
              {formatCompact(Number(latest?.[b.key] ?? 0))}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: COST_COLOR }} />
          <span className="text-muted-foreground">Est. cost</span>
          <span className="font-medium tabular-nums">{formatUsd(latest?.cost ?? 0)}</span>
        </li>
      </ul>
      <ChartContainer config={config} className={cn("h-[280px]", className)}>
        <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="bucket"
            interval={interval}
            minTickGap={16}
            tickFormatter={(v: string) => formatHourLabelInTz(v, tz)}
          />
          <YAxis
            yAxisId="tokens"
            width={48}
            tickFormatter={(v: number) => formatCompact(v)}
          />
          <YAxis
            yAxisId="cost"
            orientation="right"
            width={56}
            tickFormatter={(v: number) => formatUsd(v)}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
                  <div className="mb-1 text-xs font-medium opacity-70">
                    {formatHourLabelInTz(label as string, tz)}
                  </div>
                  <div className="space-y-0.5">
                    {payload.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: p.color }}
                        />
                        <span className="opacity-70">{p.name}</span>
                        <span className="ml-auto font-mono">
                          {p.dataKey === "cost"
                            ? formatUsd(Number(p.value ?? 0))
                            : formatExact(Number(p.value ?? 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }}
          />
          {BANDS.map((b) => (
            <Area
              key={b.key}
              yAxisId="tokens"
              type="monotone"
              dataKey={b.key}
              name={b.label}
              stackId="tok"
              stroke={b.color}
              fill={b.color}
              fillOpacity={0.35}
              isAnimationActive={false}
            />
          ))}
          <Line
            yAxisId="cost"
            type="monotone"
            dataKey="cost"
            name="Est. cost"
            stroke={COST_COLOR}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}
