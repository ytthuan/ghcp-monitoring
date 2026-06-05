"use client";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ZAxis,
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "~/components/ui/chart";

export function ScatterDistribution({
  data,
  xKey,
  yKey,
}: {
  data: Array<Record<string, number>>;
  xKey: string;
  yKey: string;
}) {
  return (
    <ChartContainer config={{}}>
      <ScatterChart>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis type="number" dataKey={xKey} />
        <YAxis type="number" dataKey={yKey} />
        <ZAxis range={[40, 40]} />
        <Tooltip content={<ChartTooltipContent />} />
        <Scatter data={data} fill="hsl(var(--chart-1))" />
      </ScatterChart>
    </ChartContainer>
  );
}
