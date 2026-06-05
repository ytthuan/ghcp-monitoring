import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { z } from "zod";
import { useFilters } from "~/lib/use-filters";
import { useTimezone, resolveQueryTz } from "~/lib/use-timezone";
import { Heatmap } from "~/components/charts/Heatmap";
import { ChartSkeleton } from "~/components/layout/Skeletons";
import { EmptyState } from "~/components/layout/EmptyState";
import { FiltersSchema } from "~/lib/types";
import { formatNumber } from "~/lib/format";
import {
  ChartCard,
  QuickStat,
  SidePanelSection,
} from "./-charts/ChartCard";

const HeatmapInput = z.object({ filters: FiltersSchema, tz: z.string() });
type HeatmapInput = z.infer<typeof HeatmapInput>;

const fetchHeatmap = createServerFn({ method: "POST" })
  .inputValidator((d: HeatmapInput) => HeatmapInput.parse(d))
  .handler(async ({ data }) => {
    const { getHeatmap } = await import("~/server/queries/heatmap");
    return getHeatmap({ filters: data.filters, tz: data.tz });
  });

export const Route = createFileRoute("/heatmap")({
  component: HeatmapPage,
});

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function HeatmapPage() {
  const { filters } = useFilters();
  const { tz } = useTimezone();
  const serverTz = resolveQueryTz(tz);
  const q = useQuery({
    queryKey: ["heatmap", filters, serverTz],
    queryFn: () => fetchHeatmap({ data: { filters, tz: serverTz } }),
  });

  if (q.isLoading) return <ChartSkeleton height={400} />;
  if (q.error) throw q.error;
  if (!q.data || q.data.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No activity in this range"
        description="Try widening the time range or removing model filters."
      />
    );
  }

  let totalCalls = 0;
  let peakDow = 0;
  let peakHour = 0;
  let peakCalls = 0;
  const hourBuckets = new Array<number>(24).fill(0);
  const dowBuckets = new Array<number>(7).fill(0);
  for (const c of q.data) {
    totalCalls += c.calls;
    const dowIdx = (c.dow + 6) % 7;
    if (dowIdx >= 0 && dowIdx < 7) (dowBuckets[dowIdx] = (dowBuckets[dowIdx] ?? 0) + c.calls);
    if (c.hour >= 0 && c.hour < 24) (hourBuckets[c.hour] = (hourBuckets[c.hour] ?? 0) + c.calls);
    if (c.calls > peakCalls) {
      peakCalls = c.calls;
      peakDow = dowIdx;
      peakHour = c.hour;
    }
  }

  const peakLabel = peakCalls > 0
    ? `${DOW_LABELS[peakDow] ?? "—"} ${peakHour.toString().padStart(2, "0")}:00`
    : "—";

  // top hour and top dow overall
  let topHour = 0;
  let topHourCalls = 0;
  hourBuckets.forEach((v, i) => {
    if (v > topHourCalls) {
      topHourCalls = v;
      topHour = i;
    }
  });
  let topDow = 0;
  let topDowCalls = 0;
  dowBuckets.forEach((v, i) => {
    if (v > topDowCalls) {
      topDowCalls = v;
      topDow = i;
    }
  });

  return (
    <ChartCard
      eyebrow="Call volume by hour of day vs day of week"
      title="Activity heatmap"
      whatThisMeasures="Number of chat calls bucketed by hour of day and day of week in the active timezone. Darker cells = more calls."
      stat={peakLabel}
      statLabel={`Peak bucket: ${peakLabel} with ${formatNumber(peakCalls)} calls`}
      drillTo="/traces"
      drillLabel="View traces with this filter"
      chart={<Heatmap data={q.data} tz={serverTz} />}
      side={
        <>
          <SidePanelSection heading="Peak">
            <div className="space-y-1.5">
              <QuickStat label="Peak bucket" value={peakLabel} />
              <QuickStat label="Peak calls" value={formatNumber(peakCalls)} />
            </div>
          </SidePanelSection>
          <SidePanelSection heading="Quick stats">
            <div className="space-y-1.5">
              <QuickStat label="Total calls" value={formatNumber(totalCalls)} />
              <QuickStat
                label="Busiest hour"
                value={`${topHour.toString().padStart(2, "0")}:00`}
              />
              <QuickStat
                label="Busiest day"
                value={DOW_LABELS[topDow] ?? "—"}
              />
            </div>
          </SidePanelSection>
        </>
      }
    />
  );
}
