import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { z } from "zod";
import { useFilters } from "~/lib/use-filters";
import { useTimezone, resolveQueryTz } from "~/lib/use-timezone";
import { Donut } from "~/components/charts/Donut";
import { ChartSkeleton } from "~/components/layout/Skeletons";
import { EmptyState } from "~/components/layout/EmptyState";
import { FiltersSchema } from "~/lib/types";
import { formatNumber, formatPct } from "~/lib/format";
import {
  ChartCard,
  LegendList,
  QuickStat,
  SidePanelSection,
  type LegendItem,
} from "./-charts/ChartCard";

const FinishInput = z.object({
  filters: FiltersSchema,
  tz: z.string(),
});
type FinishInput = z.infer<typeof FinishInput>;

const fetchFinish = createServerFn({ method: "POST" })
  .inputValidator((d: FinishInput) => FinishInput.parse(d))
  .handler(async ({ data }) => {
    const { getFinishReasons, getFinishOverTime } = await import(
      "~/server/queries/finish"
    );
    const [byReason, overTime] = await Promise.all([
      getFinishReasons(data.filters),
      getFinishOverTime({ filters: data.filters, tz: data.tz }),
    ]);
    return { byReason, overTime };
  });

export const Route = createFileRoute("/finish")({
  component: FinishPage,
});

function FinishPage() {
  const { filters } = useFilters();
  const { tz } = useTimezone();
  const serverTz = resolveQueryTz(tz);
  const q = useQuery({
    queryKey: ["finish", filters, serverTz],
    queryFn: () => fetchFinish({ data: { filters, tz: serverTz } }),
  });

  if (q.isLoading) return <ChartSkeleton height={400} />;
  if (q.error) throw q.error;
  if (!q.data || q.data.byReason.length === 0) {
    return (
      <EmptyState
        icon={CircleCheck}
        title="No finish reasons in this range"
        description="Try widening the time range or removing model filters."
      />
    );
  }

  const total = q.data.byReason.reduce((s, r) => s + r.count, 0);
  const sortedReasons = [...q.data.byReason].sort((a, b) => b.count - a.count);
  const topReason = sortedReasons[0];
  const topShare = topReason && total > 0 ? topReason.count / total : 0;

  const items: LegendItem[] = sortedReasons.map((r) => ({
    key: r.reason,
    label: r.reason,
    value: r.count,
    share: total > 0 ? r.count / total : 0,
  }));

  const statLabel = topReason
    ? `${topReason.reason} (${formatPct(topShare)})`
    : "—";

  return (
    <ChartCard
      eyebrow="Finish reason mix"
      title="Finish reasons"
      whatThisMeasures="Share of chat calls that ended with each gen_ai.response.finish_reasons value (e.g. stop, length, tool_calls). Helps spot truncations and tool loops."
      stat={statLabel}
      statLabel={`Top finish reason ${statLabel}`}
      drillTo="/calls"
      chart={
        <Donut
          data={q.data.byReason}
          nameKey="reason"
          valueKey="count"
        />
      }
      side={
        <>
          <SidePanelSection heading="Quick stats">
            <div className="space-y-1.5">
              <QuickStat
                label="Top reason"
                value={topReason?.reason ?? "—"}
              />
              <QuickStat label="Top share" value={formatPct(topShare)} />
              <QuickStat label="Total calls" value={formatNumber(total)} />
              <QuickStat label="Distinct reasons" value={formatNumber(items.length)} />
            </div>
          </SidePanelSection>
          <SidePanelSection heading="All reasons">
            <LegendList
              items={items}
              formatValue={formatNumber}
              max={items.length}
            />
          </SidePanelSection>
        </>
      }
    />
  );
}
