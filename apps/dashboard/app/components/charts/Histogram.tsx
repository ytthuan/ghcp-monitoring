"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "~/components/ui/chart";
import { cn } from "~/lib/utils";

export function Histogram({
  data,
  xKey = "bucket",
  yKey = "count",
  color = "hsl(var(--chart-1))",
  className,
}: {
  data: object[];
  xKey?: string;
  yKey?: string;
  color?: string;
  className?: string;
}) {
  return (
    <ChartContainer config={{}} className={cn("h-[260px]", className)}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey={xKey} />
        <YAxis />
        <Tooltip content={<ChartTooltipContent />} />
        <Bar dataKey={yKey} fill={color} />
      </BarChart>
    </ChartContainer>
  );
}
