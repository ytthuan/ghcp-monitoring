"use client";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { ChartContainer } from "~/components/ui/chart";
import { colorByIndex } from "~/lib/colors";
import { formatExact, formatPct } from "~/lib/format";
import { cn } from "~/lib/utils";

export function Donut({
  data,
  nameKey,
  valueKey,
  className,
  innerRadius = 60,
  outerRadius = 100,
  legend = true,
}: {
  data: Array<Record<string, string | number>>;
  nameKey: string;
  valueKey: string;
  className?: string;
  innerRadius?: number;
  outerRadius?: number;
  legend?: boolean;
}) {
  const total = data.reduce((s, d) => s + Number(d[valueKey] ?? 0), 0);
  return (
    <ChartContainer config={{}} className={cn("h-[300px]", className)}>
      <PieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
        >
          {data.map((_d, i) => (
            <Cell key={i} fill={colorByIndex(i, data.length)} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]!;
            const value = Number(p.value ?? 0);
            const share = total > 0 ? value / total : 0;
            return (
              <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                <div className="font-medium">{String(p.name)}</div>
                <div className="mt-1 flex items-center gap-2 tabular-nums">
                  <span className="font-mono">{formatExact(value)}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{formatPct(share)}</span>
                </div>
              </div>
            );
          }}
        />
        {legend && <Legend />}
      </PieChart>
    </ChartContainer>
  );
}
