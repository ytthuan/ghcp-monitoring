import { useMemo, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Download, Search, Wrench } from "lucide-react";
import { useFilters } from "~/lib/use-filters";
import { useTimezone, formatTimestampInTz } from "~/lib/use-timezone";
import { BarHorizontal } from "~/components/charts/BarHorizontal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Button } from "~/components/ui/button";
import { TableSkeleton } from "~/components/layout/Skeletons";
import { EmptyState } from "~/components/layout/EmptyState";
import { FormatCell } from "~/components/data/FormatCell";
import { FiltersSchema, type Filters, type ToolRow } from "~/lib/types";
import { cn } from "~/lib/utils";
import { useKeyboardRowNav } from "./-leaderboard/useKeyboardRowNav";
import { useSorted } from "./-leaderboard/useSorted";
import { SortHeader } from "./-leaderboard/SortHeader";
import { downloadCsv, todayStamp } from "./-leaderboard/csv";
import { useFocusActiveRow } from "./-leaderboard/useFocusActiveRow";

const fetchTools = createServerFn({ method: "POST" })
  .inputValidator((d: Filters) => FiltersSchema.parse(d))
  .handler(async ({ data }) => {
    const { getTools } = await import("~/server/queries/tools");
    return getTools(data);
  });

export const Route = createFileRoute("/tools")({
  component: ToolsPage,
});

type ToolKey =
  | "tool_name"
  | "count"
  | "error_count"
  | "mean_ms"
  | "p50_ms"
  | "p90_ms"
  | "p99_ms"
  | "error_rate"
  | "latest_at";

const COLS = 9;

function toolValue(r: ToolRow, k: ToolKey): number | string {
  return r[k];
}

function ToolsPage() {
  const { filters } = useFilters();
  const { tz } = useTimezone();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["tools", filters],
    queryFn: () => fetchTools({ data: filters }),
  });

  const rows: ToolRow[] = q.data ?? [];
  const { sorted, sortKey, sortDir, toggle } = useSorted<ToolRow, ToolKey>(
    rows,
    "count",
    "desc",
    toolValue,
  );

  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
  const drilldown = (_i: number) => {
    // Tools page has no per-tool detail dialog yet; drill into /calls with
    // current filters preserved so the user lands in the right time window.
    void navigate({
      to: "/calls",
      search: (prev: Record<string, unknown>) => ({ ...prev }),
    });
  };
  const { rowProps, activeIndex } = useKeyboardRowNav(sorted.length, (i) => {
    drilldown(i);
  });
  useFocusActiveRow(tbodyRef, activeIndex);

  const top = useMemo(() => {
    return rows
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((r) => ({ tool_name: r.tool_name, count: r.count }));
  }, [rows]);

  function exportCsv() {
    // Note: tool_name + numeric metrics only — never tool args/results.
    downloadCsv(
      `tools-${todayStamp()}.csv`,
      [
        "tool_name",
        "count",
        "error_count",
        "mean_ms",
        "p50_ms",
        "p90_ms",
        "p99_ms",
        "error_rate",
        "latest_at",
      ],
      sorted.map((r) => [
        r.tool_name,
        r.count,
        r.error_count,
        r.mean_ms,
        r.p50_ms,
        r.p90_ms,
        r.p99_ms,
        r.error_rate,
        r.latest_at,
      ]),
    );
  }

  if (q.isLoading) return <TableSkeleton rows={10} cols={10} />;
  if (q.error) throw q.error;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Leaderboard
            </div>
            <CardTitle>Tool invocations</CardTitle>
            <CardDescription>
              Aggregated from canonical tool attributes and{" "}
              <span className="font-mono">execute_tool *</span> trace spans.
            </CardDescription>
          </div>
          <div className="shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportCsv}
              aria-label="Export tools as CSV"
              disabled={sorted.length === 0}
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="relative max-h-[70vh] overflow-auto rounded-md border">
            <Table className="min-w-[880px]">
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]">
                <TableRow>
                  <TableHead>
                    <SortHeader
                      label="Tool"
                      active={sortKey === "tool_name"}
                      dir={sortDir}
                      onClick={() => toggle("tool_name")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader
                      label="Count"
                      align="right"
                      active={sortKey === "count"}
                      dir={sortDir}
                      onClick={() => toggle("count")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader
                      label="Errors"
                      align="right"
                      active={sortKey === "error_count"}
                      dir={sortDir}
                      onClick={() => toggle("error_count")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader
                      label="Mean duration"
                      align="right"
                      active={sortKey === "mean_ms"}
                      dir={sortDir}
                      onClick={() => toggle("mean_ms")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader
                      label="p50"
                      align="right"
                      active={sortKey === "p50_ms"}
                      dir={sortDir}
                      onClick={() => toggle("p50_ms")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader
                      label="p90"
                      align="right"
                      active={sortKey === "p90_ms"}
                      dir={sortDir}
                      onClick={() => toggle("p90_ms")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader
                      label="p99"
                      align="right"
                      active={sortKey === "p99_ms"}
                      dir={sortDir}
                      onClick={() => toggle("p99_ms")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader
                      label="Error rate"
                      align="right"
                      active={sortKey === "error_rate"}
                      dir={sortDir}
                      onClick={() => toggle("error_rate")}
                    />
                  </TableHead>
                  <TableHead>
                    <SortHeader
                      label="Latest"
                      active={sortKey === "latest_at"}
                      dir={sortDir}
                      onClick={() => toggle("latest_at")}
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody ref={tbodyRef}>
                {sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COLS} className="p-0">
                      <EmptyState
                        icon={Search}
                        title="No tool invocations match these filters"
                        description="Loosen the time range or clear filters to see tool activity."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((r, i) => {
                    const props = rowProps(i);
                    return (
                      <TableRow
                        key={r.tool_name}
                        {...props}
                        aria-rowindex={i + 1}
                        onClick={() => drilldown(i)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            drilldown(i);
                          }
                        }}
                        className={cn(
                          "cursor-pointer outline-none data-[active=true]:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        )}
                      >
                        <TableCell className="font-mono text-xs">
                          {r.tool_name}
                        </TableCell>
                        <TableCell className="text-right">
                          <FormatCell kind="number" value={r.count} />
                        </TableCell>
                        <TableCell className="text-right">
                          {r.error_count > 0 ? (
                            <span className="tabular-nums text-destructive">
                              {r.error_count}
                            </span>
                          ) : (
                            <FormatCell kind="number" value={r.error_count} />
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <FormatCell kind="ms" value={r.mean_ms} />
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
                        <TableCell className="text-right">
                          <FormatCell kind="pct" value={r.error_rate} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatTimestampInTz(r.latest_at, tz)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-right text-xs text-muted-foreground md:hidden">
            Scroll →
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Top 8
            </div>
            <CardTitle>Invocations by tool</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {top.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="No tool invocations in this window"
              description="Widen the time range or clear filters to see top tools."
            />
          ) : (
            <BarHorizontal data={top} xKey="count" yKey="tool_name" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
