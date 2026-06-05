import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { useFilters } from "~/lib/use-filters";
import { BarHorizontal } from "~/components/charts/BarHorizontal";
import { ChartSkeleton } from "~/components/layout/Skeletons";
import { EmptyState } from "~/components/layout/EmptyState";
import { formatPct, formatUsd, formatCompact, formatNumber } from "~/lib/format";
import { cacheHitRatio } from "~/lib/token-math";
import { FiltersSchema, type Filters } from "~/lib/types";
import { rateFor } from "~/server/pricing";
import {
  ChartCard,
  LegendList,
  QuickStat,
  SidePanelSection,
  type LegendItem,
} from "./-charts/ChartCard";

const fetchCache = createServerFn({ method: "POST" })
  .inputValidator((d: Filters) => FiltersSchema.parse(d))
  .handler(async ({ data }) => {
    const { getCacheByModel } = await import("~/server/queries/cache");
    return getCacheByModel(data);
  });

export const Route = createFileRoute("/cache")({
  component: CachePage,
});

function CachePage() {
  const { filters } = useFilters();
  const q = useQuery({
    queryKey: ["cache", filters],
    queryFn: () => fetchCache({ data: filters }),
  });

  if (q.isLoading) return <ChartSkeleton height={400} />;
  if (q.error) throw q.error;
  if (!q.data || q.data.length === 0) {
    return (
      <EmptyState
        icon={Database}
        title="No cache data in this range"
        description="Try widening the time range or removing model filters."
      />
    );
  }

  let totalRead = 0;
  let totalInput = 0;
  let savings = 0;
  let pricedRead = 0;
  for (const r of q.data) {
    totalRead += r.cache_read;
    totalInput += r.input;
    const rate = rateFor(r.model);
    if (rate) {
      savings += (r.cache_read * (rate.input - rate.cache_read)) / 1_000_000;
      pricedRead += r.cache_read;
    }
  }
  const overall = cacheHitRatio(totalInput, totalRead);
  const pricingComplete = pricedRead === totalRead && totalRead > 0;

  const chartData = q.data.map((r) => ({
    model: r.model,
    hit_ratio: Number((r.hit_ratio * 100).toFixed(2)),
  }));

  const totalReadAll = totalRead;
  const readByModel: LegendItem[] = q.data
    .map((r) => ({
      key: r.model,
      label: r.model,
      value: r.cache_read,
      share: totalReadAll > 0 ? r.cache_read / totalReadAll : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <ChartCard
      eyebrow="Cache hit rate by model"
      title="Cache hit rate"
      whatThisMeasures="Share of prompt input tokens served from prompt cache. Higher means more reuse and lower cost. Computed as cache_read / input."
      stat={formatPct(overall)}
      statLabel={`Overall hit rate ${formatPct(overall)}`}
      drillTo="/calls"
      chart={
        <BarHorizontal data={chartData} xKey="hit_ratio" yKey="model" />
      }
      side={
        <>
          <SidePanelSection heading="Quick stats">
            <div className="space-y-1.5">
              <QuickStat label="Hit rate" value={formatPct(overall)} />
              <QuickStat
                label="Cache read tokens"
                value={formatCompact(totalRead)}
                hint={`${formatNumber(totalRead)} tokens`}
              />
              <QuickStat
                label="Prompt input"
                value={formatCompact(totalInput)}
                hint={`${formatNumber(totalInput)} tokens`}
              />
              <QuickStat
                label="Estimated savings"
                value={pricingComplete || savings > 0 ? formatUsd(savings) : "—"}
                hint={
                  pricingComplete
                    ? "Rate from app/server/pricing.ts: (input rate − cache_read rate) × cache_read tokens."
                    : "Pricing data unavailable for some models in this range — savings is a partial estimate."
                }
              />
            </div>
          </SidePanelSection>
          <SidePanelSection heading="Cache reads by model">
            <LegendList items={readByModel} formatValue={formatCompact} />
          </SidePanelSection>
        </>
      }
    />
  );
}
