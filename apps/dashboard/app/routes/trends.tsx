import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { LineChart } from "lucide-react";
import { z } from "zod";
import { useFilters } from "~/lib/use-filters";
import { useTimezone, resolveQueryTz } from "~/lib/use-timezone";
import { AreaStacked } from "~/components/charts/AreaStacked";
import { ChartSkeleton } from "~/components/layout/Skeletons";
import { EmptyState } from "~/components/layout/EmptyState";
import { FiltersSchema } from "~/lib/types";
import { formatCompact, formatNumber } from "~/lib/format";
import { additiveTokenTotal, freshInputTokens } from "~/lib/token-math";
import {
  ChartCard,
  LegendList,
  QuickStat,
  SidePanelSection,
  type LegendItem,
} from "./-charts/ChartCard";

const TrendInput = z.object({ filters: FiltersSchema, tz: z.string() });
type TrendInput = z.infer<typeof TrendInput>;

const fetchTrend = createServerFn({ method: "POST" })
  .inputValidator((d: TrendInput) => TrendInput.parse(d))
  .handler(async ({ data }) => {
    const { getTrend } = await import("~/server/queries/trend");
    return getTrend({ filters: data.filters, tz: data.tz });
  });

export const Route = createFileRoute("/trends")({
  component: TrendsPage,
});

function TrendsPage() {
  const { filters } = useFilters();
  const { tz } = useTimezone();
  const serverTz = resolveQueryTz(tz);
  const q = useQuery({
    queryKey: ["trend", filters, serverTz],
    queryFn: () => fetchTrend({ data: { filters, tz: serverTz } }),
  });

  if (q.isLoading) return <ChartSkeleton height={400} />;
  if (q.error) throw q.error;
  if (!q.data || q.data.length === 0) {
    return (
      <EmptyState
        icon={LineChart}
        title="No trend data in this range"
        description="Try widening the time range or removing model filters."
      />
    );
  }

  let totalCalls = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheCreate = 0;
  for (const p of q.data) {
    totalCalls += p.calls;
    totalInput += p.input;
    totalOutput += p.output;
    totalCacheRead += p.cache_read;
    totalCacheCreate += p.cache_create;
  }
  const totalFreshInput = freshInputTokens(totalInput, totalCacheRead);
  const totalTokens = additiveTokenTotal({
    input: totalInput,
    output: totalOutput,
    cache_create: totalCacheCreate,
  });
  const chartData = q.data.map((point) => ({
    ...point,
    fresh_input: freshInputTokens(point.input, point.cache_read),
  }));
  const series: LegendItem[] = [
    { key: "fresh_input", label: "Fresh input", value: totalFreshInput, share: totalTokens > 0 ? totalFreshInput / totalTokens : 0 },
    { key: "output", label: "Output", value: totalOutput, share: totalTokens > 0 ? totalOutput / totalTokens : 0 },
    { key: "cache_read", label: "Cache read", value: totalCacheRead, share: totalTokens > 0 ? totalCacheRead / totalTokens : 0 },
    { key: "cache_create", label: "Cache create", value: totalCacheCreate, share: totalTokens > 0 ? totalCacheCreate / totalTokens : 0 },
  ].sort((a, b) => b.value - a.value);

  return (
    <ChartCard
      eyebrow="Calls and tokens over time"
      title="Token volume over time"
      whatThisMeasures="Tokens consumed by Copilot chat calls, bucketed by your selected granularity. Stacked by token kind: fresh input, output, cache read, and cache creation."
      stat={formatCompact(totalCalls)}
      statLabel={`${formatNumber(totalCalls)} calls in range`}
      drillTo="/calls"
      chart={
        <div className="h-[320px]">
          <AreaStacked
            data={chartData}
            keys={["fresh_input", "output", "cache_read", "cache_create"]}
            tz={tz}
          />
        </div>
      }
      side={
        <>
          <SidePanelSection heading="Token mix">
            <LegendList items={series} formatValue={formatCompact} />
          </SidePanelSection>
          <SidePanelSection heading="Quick stats">
            <div className="space-y-1.5">
              <QuickStat label="Total calls" value={formatNumber(totalCalls)} />
              <QuickStat label="Total tokens" value={formatCompact(totalTokens)} />
              <QuickStat label="Buckets" value={formatNumber(q.data.length)} />
            </div>
          </SidePanelSection>
        </>
      }
    />
  );
}
