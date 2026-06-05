"use client";
import { LineChart, Line, ResponsiveContainer } from "recharts";

export function Sparkline({
  data,
  dataKey = "value",
  stroke = "hsl(var(--chart-1))",
}: {
  data: Array<Record<string, string | number>>;
  dataKey?: string;
  stroke?: string;
}) {
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={stroke}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
