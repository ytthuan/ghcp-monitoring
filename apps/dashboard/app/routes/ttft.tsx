import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { useFilters } from "~/lib/use-filters";
import { ChartSkeleton } from "~/components/layout/Skeletons";
import { EmptyState } from "~/components/layout/EmptyState";
import { FormatCell } from "~/components/data/FormatCell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { FiltersSchema, type Filters } from "~/lib/types";
import { formatMs, formatNumber } from "~/lib/format";
import {
  ChartCard,
  LegendList,
  QuickStat,
  SidePanelSection,
  type LegendItem,
} from "./-charts/ChartCard";

const fetchTtft = createServerFn({ method: "POST" })
  .inputValidator((d: Filters) => FiltersSchema.parse(d))
  .handler(async ({ data }) => {
    const { getTtftByModel } = await import("~/server/queries/ttft");
    return getTtftByModel(data);
  });

export const Route = createFileRoute("/ttft")({
  component: TtftPage,
});

function TtftPage() {
  const { filters } = useFilters();
  const q = useQuery({
    queryKey: ["ttft", filters],
    queryFn: () => fetchTtft({ data: filters }),
  });

  if (q.isLoading) return <ChartSkeleton height={400} />;
  if (q.error) throw q.error;
  if (!q.data || q.data.length === 0) {
    return (
      <EmptyState
        icon={Timer}
        title="No TTFT samples in this range"
        description="Copilot may not be emitting the gen_ai.server.time_to_first_token histogram. Enable it in the collector or widen the time range."
      />
    );
  }

  // Weighted aggregate p50/p90/p99 across models (sample-weighted average of
  // per-model quantiles — approximation, but stable for the eyebrow stat).
  let totalCount = 0;
  let p50Sum = 0;
  let p90Sum = 0;
  let p99Sum = 0;
  let topModel = q.data[0]?.model ?? "—";
  let topModelP90 = 0;
  for (const r of q.data) {
    totalCount += r.count;
    p50Sum += r.p50_ms * r.count;
    p90Sum += r.p90_ms * r.count;
    p99Sum += r.p99_ms * r.count;
    if (r.p90_ms > topModelP90) {
      topModelP90 = r.p90_ms;
      topModel = r.model;
    }
  }
  const aggP50 = totalCount > 0 ? p50Sum / totalCount : 0;
  const aggP90 = totalCount > 0 ? p90Sum / totalCount : 0;
  const aggP99 = totalCount > 0 ? p99Sum / totalCount : 0;

  const samplesByModel: LegendItem[] = q.data
    .map((r) => ({
      key: r.model,
      label: r.model,
      value: r.count,
      share: totalCount > 0 ? r.count / totalCount : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <ChartCard
      eyebrow="Time-to-first-token distribution"
      title="TTFT by model"
      whatThisMeasures="Time from request start until the first response token arrives, per model. Lower is better."
      stat={formatMs(aggP50)}
      statLabel={`Median TTFT across ${formatNumber(totalCount)} samples`}
      drillTo="/calls"
      chart={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Samples</TableHead>
              <TableHead className="text-right">p50</TableHead>
              <TableHead className="text-right">p90</TableHead>
              <TableHead className="text-right">p99</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.map((r) => (
              <TableRow key={r.model}>
                <TableCell>{r.model}</TableCell>
                <TableCell className="text-right">
                  <FormatCell kind="number" value={r.count} />
                </TableCell>
                <TableCell className="text-right">
                  <FormatCell kind="ms" value={r.p50_ms} />
                </TableCell>
                <TableCell className="text-right">
                  <FormatCell kind="ms" value={r.p90_ms} />
                </TableCell>
                <TableCell className="text-right">
                  <FormatCell kind="ms" value={r.p99_ms} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
      side={
        <>
          <SidePanelSection heading="Aggregate quantiles">
            <div className="space-y-1.5">
              <QuickStat label="p50" value={formatMs(aggP50)} />
              <QuickStat label="p90" value={formatMs(aggP90)} />
              <QuickStat label="p99" value={formatMs(aggP99)} />
              <QuickStat
                label="Slowest model (p90)"
                value={topModel}
                hint={`${topModel} has the highest p90 (${formatMs(topModelP90)}).`}
              />
            </div>
          </SidePanelSection>
          <SidePanelSection heading="Samples by model">
            <LegendList items={samplesByModel} formatValue={formatNumber} />
          </SidePanelSection>
        </>
      }
    />
  );
}
