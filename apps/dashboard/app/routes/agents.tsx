import { useMemo, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Bot, Download, Search } from "lucide-react";
import { useFilters } from "~/lib/use-filters";
import { BarHorizontal } from "~/components/charts/BarHorizontal";
import {
  Card,
  CardContent,
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
import { FiltersSchema, type AgentRow, type Filters } from "~/lib/types";
import { cn } from "~/lib/utils";
import { useKeyboardRowNav } from "./-leaderboard/useKeyboardRowNav";
import { useSorted } from "./-leaderboard/useSorted";
import { SortHeader } from "./-leaderboard/SortHeader";
import { downloadCsv, todayStamp } from "./-leaderboard/csv";
import { useFocusActiveRow } from "./-leaderboard/useFocusActiveRow";

const fetchAgents = createServerFn({ method: "POST" })
  .inputValidator((d: Filters) => FiltersSchema.parse(d))
  .handler(async ({ data }) => {
    const { getByAgent } = await import("~/server/queries/by_agent");
    return getByAgent(data);
  });

export const Route = createFileRoute("/agents")({
  component: AgentsPage,
});

type AgentKey = "agent_name" | "calls" | "input" | "output" | "tokens";
const COLS = 4;

function agentValue(r: AgentRow, k: AgentKey): number | string {
  switch (k) {
    case "agent_name":
      return r.agent_name;
    case "tokens":
      return r.input + r.output;
    default:
      return r[k];
  }
}

function AgentsPage() {
  const { filters } = useFilters();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["agents", filters],
    queryFn: () => fetchAgents({ data: filters }),
  });

  const rows: AgentRow[] = q.data ?? [];
  const { sorted, sortKey, sortDir, toggle } = useSorted<AgentRow, AgentKey>(
    rows,
    "calls",
    "desc",
    agentValue,
  );

  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
  const drilldown = (i: number) => {
    const r = sorted[i];
    if (!r) return;
    void navigate({
      to: "/calls",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        agents: [r.agent_name],
      }),
    });
  };
  const { rowProps, activeIndex } = useKeyboardRowNav(sorted.length, (i) => {
    drilldown(i);
  });
  useFocusActiveRow(tbodyRef, activeIndex);

  const top = useMemo(() => {
    return rows
      .slice()
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 8)
      .map((r) => ({ agent_name: r.agent_name, calls: r.calls }));
  }, [rows]);

  function exportCsv() {
    downloadCsv(
      `agents-${todayStamp()}.csv`,
      ["agent_name", "calls", "input", "output", "tokens"],
      sorted.map((r) => [
        r.agent_name,
        r.calls,
        r.input,
        r.output,
        r.input + r.output,
      ]),
    );
  }

  if (q.isLoading) return <TableSkeleton rows={10} cols={5} />;
  if (q.error) throw q.error;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Leaderboard
            </div>
            <CardTitle>Per-agent breakdown</CardTitle>
          </div>
          <div className="shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportCsv}
              aria-label="Export agents as CSV"
              disabled={sorted.length === 0}
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="relative max-h-[70vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]">
                <TableRow>
                  <TableHead>
                    <SortHeader
                      label="Agent"
                      active={sortKey === "agent_name"}
                      dir={sortDir}
                      onClick={() => toggle("agent_name")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader
                      label="Calls"
                      align="right"
                      active={sortKey === "calls"}
                      dir={sortDir}
                      onClick={() => toggle("calls")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader
                      label="Input"
                      align="right"
                      active={sortKey === "input"}
                      dir={sortDir}
                      onClick={() => toggle("input")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader
                      label="Output"
                      align="right"
                      active={sortKey === "output"}
                      dir={sortDir}
                      onClick={() => toggle("output")}
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
                        title="No agents match these filters"
                        description="Loosen the time range or clear filters to see agent activity."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((r, i) => {
                    const props = rowProps(i);
                    return (
                      <TableRow
                        key={r.agent_name}
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
                          {r.agent_name}
                        </TableCell>
                        <TableCell className="text-right">
                          <FormatCell kind="number" value={r.calls} />
                        </TableCell>
                        <TableCell className="text-right">
                          <FormatCell kind="number" value={r.input} />
                        </TableCell>
                        <TableCell className="text-right">
                          <FormatCell kind="number" value={r.output} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Top 8
            </div>
            <CardTitle>Calls by agent</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {top.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No agent activity in this window"
              description="Widen the time range or clear filters to see top agents."
            />
          ) : (
            <BarHorizontal data={top} xKey="calls" yKey="agent_name" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
