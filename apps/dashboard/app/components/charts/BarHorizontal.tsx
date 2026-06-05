"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "~/components/ui/chart";
import { colorForModel } from "~/lib/colors";
import { cn } from "~/lib/utils";

export function BarHorizontal({
  data,
  xKey,
  yKey,
  className,
  marginLeft = 80,
  yWidth = 140,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
  className?: string;
  marginLeft?: number;
  yWidth?: number;
}) {
  return (
    <ChartContainer config={{}} className={cn("h-[360px]", className)}>
      <BarChart data={data} layout="vertical" margin={{ left: marginLeft }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
        <XAxis type="number" />
        <YAxis dataKey={yKey} type="category" width={yWidth} />
        <Tooltip content={<ChartTooltipContent />} />
        <Bar dataKey={xKey}>
          {data.map((d, i) => (
            <Cell key={i} fill={colorForModel(String(d[yKey] ?? ""))} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
