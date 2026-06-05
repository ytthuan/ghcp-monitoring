"use client";
import * as React from "react";
import { ResponsiveContainer } from "recharts";
import { formatExact } from "~/lib/format";
import { cn } from "~/lib/utils";

/**
 * Lightweight version of shadcn's <ChartContainer />. Wraps Recharts'
 * ResponsiveContainer with consistent sizing + theme tokens. Each series may
 * specify its own color via `--color-<key>` CSS variables on this container.
 */
export interface ChartConfig {
  [key: string]: { label: string; color?: string };
}

export function ChartContainer({
  config,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  config: ChartConfig;
  children: React.ReactElement;
}) {
  const cssVars = React.useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(config)) {
      if (v.color) vars[`--color-${k}`] = v.color;
    }
    return vars as React.CSSProperties;
  }, [config]);

  return (
    <div
      className={cn("h-[260px] w-full text-xs", className)}
      style={cssVars}
      {...props}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function ChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      {label !== undefined && (
        <div className="mb-1 text-xs font-medium opacity-70">{String(label)}</div>
      )}
      <div className="space-y-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: p.color }}
            />
            <span className="opacity-70">{p.name}</span>
            <span className="ml-auto font-mono">
              {typeof p.value === "number" ? formatExact(p.value) : String(p.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
