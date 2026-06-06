"use client";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "~/components/ui/chart";
import { TOKEN_COLORS, colorForModel } from "~/lib/colors";
import { formatHourLabelInTz } from "~/lib/use-timezone";

export interface AreaSeriesPoint {
  bucket: string;
  [k: string]: string | number;
}

export function AreaStacked({
  data,
  keys,
  colorFor,
  tz = "UTC",
}: {
  data: AreaSeriesPoint[];
  keys: ReadonlyArray<string>;
  colorFor?: (key: string) => string;
  tz?: string;
}) {
  const resolve = (k: string): string => {
    if (colorFor) return colorFor(k);
    if (k in TOKEN_COLORS) return TOKEN_COLORS[k as keyof typeof TOKEN_COLORS];
    return colorForModel(k);
  };
  const config: ChartConfig = Object.fromEntries(
    keys.map((k) => [k, { label: k, color: resolve(k) }]),
  );
  // Keep coarse time anchors even for dense series instead of hiding the axis
  // entirely — a monitoring chart should stay readable in a static screenshot.
  const tickInterval =
    data.length > 6 ? Math.max(0, Math.ceil(data.length / 6) - 1) : 0;
  return (
    <ChartContainer config={config}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis
          dataKey="bucket"
          interval={tickInterval}
          minTickGap={16}
          tickFormatter={(v: string) => formatHourLabelInTz(v, tz)}
        />
        <YAxis />
        <Tooltip
          content={<ChartTooltipContent />}
          labelFormatter={(v) => formatHourLabelInTz(v as string, tz)}
        />
        <Legend />
        {keys.map((k) => (
          <Area
            key={k}
            type="monotone"
            dataKey={k}
            stackId="1"
            stroke={resolve(k)}
            fill={resolve(k)}
            fillOpacity={0.4}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
