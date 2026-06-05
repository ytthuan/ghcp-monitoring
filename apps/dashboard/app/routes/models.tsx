import { useMemo, useRef } from "react";
import { useFocusActiveRow } from "./-leaderboard/useFocusActiveRow";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Download, Search } from "lucide-react";
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
import { CostCell } from "~/components/data/CostCell";
import { InternalModelBadge } from "~/components/data/InternalModelBadge";
import { formatCredits, formatNumber, formatUsd, formatUsdExact } from "~/lib/format";
import { additiveTokenTotal, freshInputTokens } from "~/lib/token-math";
import { FiltersSchema, type Filters, type ModelRow } from "~/lib/types";
import { cn } from "~/lib/utils";
import { useKeyboardRowNav } from "./-leaderboard/useKeyboardRowNav";
import { useSorted } from "./-leaderboard/useSorted";
import { SortHeader } from "./-leaderboard/SortHeader";
import { downloadCsv, todayStamp } from "./-leaderboard/csv";

const fetchModels = createServerFn({ method: "POST" })
  .inputValidator((d: Filters) => FiltersSchema.parse(d))
  .handler(async ({ data }) => {
    const { getByModel } = await import("~/server/queries/by_model");
    return getByModel(data);
  });

export const Route = createFileRoute("/models")({
  component: ModelsPage,
});

type ModelKey =
  | "request_model"
  | "response_model"
  | "calls"
  | "input"
  | "output"
  | "cache_read"
  | "cache_create"
  | "tokens"
  | "copilot_cost";

const COLS = 9;

function modelValue(r: ModelRow, k: ModelKey): number | string {
  switch (k) {
    case "request_model":
      return r.request_model;
    case "response_model":
      return r.response_model;
    case "tokens":
      return additiveTokenTotal({
        input: r.input,
        output: r.output,
        cache_create: r.cache_create,
      });
    default:
      return r[k];
  }
}

function ModelsPage() {
  const { filters } = useFilters();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["models", filters],
    queryFn: () => fetchModels({ data: filters }),
  });

  const rows: ModelRow[] = q.data ?? [];
  const { sorted, sortKey, sortDir, toggle } = useSorted<ModelRow, ModelKey>(
    rows,
    "tokens",
    "desc",
    modelValue,
  );

  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
  const drilldown = (i: number) => {
    const r = sorted[i];
    if (!r) return;
    void navigate({
      to: "/calls",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        models: [r.response_model],
      }),
    });
  };
  const { rowProps, activeIndex } = useKeyboardRowNav(sorted.length, (i) => {
    drilldown(i);
  });

  // Refocus the matching row when activeIndex changes via keyboard.
  useFocusActiveRow(tbodyRef, activeIndex);

  const top = useMemo(() => {
    return rows
      .slice()
      .sort(
        (a, b) =>
          additiveTokenTotal({
            input: b.input,
            output: b.output,
            cache_create: b.cache_create,
          }) -
          additiveTokenTotal({
            input: a.input,
            output: a.output,
            cache_create: a.cache_create,
          }),
      )
      .slice(0, 8)
      .map((r) => ({
        response_model: r.response_model,
        tokens: additiveTokenTotal({
          input: r.input,
          output: r.output,
          cache_create: r.cache_create,
        }),
      }));
  }, [rows]);

  const decomposition = useMemo(() => {
    return rows
      .slice()
      .sort((a, b) => {
        const at =
          (a.cost_input ?? 0) +
          (a.cost_output ?? 0) +
          (a.cost_cache_read ?? 0) +
          (a.cost_cache_create ?? 0);
        const bt =
          (b.cost_input ?? 0) +
          (b.cost_output ?? 0) +
          (b.cost_cache_read ?? 0) +
          (b.cost_cache_create ?? 0);
        if (bt !== at) return bt - at;
        return (
          additiveTokenTotal({
            input: b.input,
            output: b.output,
            cache_create: b.cache_create,
          }) -
          additiveTokenTotal({
            input: a.input,
            output: a.output,
            cache_create: a.cache_create,
          })
        );
      })
      .slice(0, 25);
  }, [rows]);

  function exportCsv() {
    downloadCsv(
      `models-${todayStamp()}.csv`,
      [
        "request_model",
        "response_model",
        "calls",
        "input",
        "output",
        "cache_read",
        "cache_create",
        "tokens",
        "cost_input",
        "cost_output",
        "cost_cache_read",
        "cost_cache_create",
        "copilot_cost",
      ],
      sorted.map((r) => [
        r.request_model,
        r.response_model,
        r.calls,
        r.input,
        r.output,
        r.cache_read,
        r.cache_create,
        additiveTokenTotal({
          input: r.input,
          output: r.output,
          cache_create: r.cache_create,
        }),
        r.cost_input,
        r.cost_output,
        r.cost_cache_read,
        r.cost_cache_create,
        r.copilot_cost,
      ]),
    );
  }

  if (q.isLoading) return <TableSkeleton rows={10} cols={9} />;
  if (q.error) throw q.error;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Leaderboard
            </div>
            <CardTitle>Per-model usage and cost</CardTitle>
          </div>
          <div className="shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportCsv}
              aria-label="Export models as CSV"
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
                      label="Request model"
                      active={sortKey === "request_model"}
                      dir={sortDir}
                      onClick={() => toggle("request_model")}
                    />
                  </TableHead>
                  <TableHead>
                    <SortHeader
                      label="Response model"
                      active={sortKey === "response_model"}
                      dir={sortDir}
                      onClick={() => toggle("response_model")}
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
                  <TableHead className="text-right">
                    <SortHeader
                      label="Cache read"
                      align="right"
                      active={sortKey === "cache_read"}
                      dir={sortDir}
                      onClick={() => toggle("cache_read")}
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader
                      label="Cache create"
                      align="right"
                      active={sortKey === "cache_create"}
                      dir={sortDir}
                      onClick={() => toggle("cache_create")}
                    />
                  </TableHead>
                  <TableHead className="text-right">Est. cost</TableHead>
                  <TableHead className="text-right">
                    <SortHeader
                      label="AI credits"
                      align="right"
                      active={sortKey === "copilot_cost"}
                      dir={sortDir}
                      onClick={() => toggle("copilot_cost")}
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
                        title="No models match these filters"
                        description="Loosen the time range or clear filters to see model usage."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((r, i) => {
                    const props = rowProps(i);
                    return (
                      <TableRow
                        key={`${r.request_model}__${r.response_model}__${i}`}
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
                          <span className="inline-flex items-center gap-1.5">
                            <span>{r.request_model}</span>
                            <InternalModelBadge
                              model={r.request_model}
                              variant="pill"
                            />
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <span className="inline-flex items-center gap-1.5">
                            <span>{r.response_model}</span>
                            <InternalModelBadge
                              model={r.response_model}
                              variant="pill"
                            />
                          </span>
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
                        <TableCell className="text-right">
                          <FormatCell kind="number" value={r.cache_read} />
                        </TableCell>
                        <TableCell className="text-right">
                          <FormatCell kind="number" value={r.cache_create} />
                        </TableCell>
                        <TableCell className="text-right">
                          <CostCell
                            requestModel={r.request_model}
                            responseModel={r.response_model}
                            input={r.input}
                            output={r.output}
                            cache_read={r.cache_read}
                            cache_create={r.cache_create}
                          />
                        </TableCell>
                        <TableCell
                          className="text-right tabular-nums"
                          title="GitHub premium-request billing cost (github.copilot.cost)"
                        >
                          {r.copilot_cost > 0 ? (
                            formatCredits(r.copilot_cost)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            † unknown-priced models are excluded from cost roll-ups. Add their
            rate in <code>app/server/pricing.ts</code>.
          </p>
        </CardContent>
      </Card>

      <Card data-testid="models-cost-decomposition">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Breakdown
            </div>
            <CardTitle>Cost decomposition</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {decomposition.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No model cost in this window"
              description="Widen the time range or clear filters to see cost decomposition."
            />
          ) : (
            <div className="relative max-h-[60vh] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]">
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Cache read</TableHead>
                    <TableHead className="text-right">Cache create</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decomposition.map((r, i) => {
                    const total =
                      (r.cost_input ?? 0) +
                      (r.cost_output ?? 0) +
                      (r.cost_cache_read ?? 0) +
                      (r.cost_cache_create ?? 0);
                    const totalTokens = additiveTokenTotal({
                      input: r.input,
                      output: r.output,
                      cache_create: r.cache_create,
                    });
                    const freshInput = freshInputTokens(r.input, r.cache_read);
                    const renderCell = (
                      tokens: number,
                      cost: number | null,
                    ) => {
                      if (r.is_internal) {
                        return (
                          <div className="flex flex-col items-end">
                            <span className="tabular-nums">
                              {formatNumber(tokens)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Included
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div
                          className="flex flex-col items-end"
                          title={cost == null ? undefined : formatUsdExact(cost)}
                        >
                          <span className="tabular-nums">
                            {formatNumber(tokens)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatUsd(cost)}
                          </span>
                        </div>
                      );
                    };
                    return (
                      <TableRow
                        key={`dc-${r.request_model}__${r.response_model}__${i}`}
                      >
                        <TableCell className="font-mono text-xs">
                          <span className="inline-flex items-center gap-1.5">
                            <span>{r.response_model}</span>
                            <InternalModelBadge
                              model={r.response_model}
                              variant="pill"
                            />
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <FormatCell kind="number" value={r.calls} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex flex-col items-end"
                            title={
                              r.is_internal ? undefined : formatUsdExact(total)
                            }
                          >
                            <span className="tabular-nums">
                              {formatNumber(totalTokens)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {r.is_internal ? "Included" : formatUsd(total)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {renderCell(freshInput, r.cost_input)}
                        </TableCell>
                        <TableCell className="text-right">
                          {renderCell(r.output, r.cost_output)}
                        </TableCell>
                        <TableCell className="text-right">
                          {renderCell(r.cache_read, r.cost_cache_read)}
                        </TableCell>
                        <TableCell className="text-right">
                          {renderCell(r.cache_create, r.cost_cache_create)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Top 8
            </div>
            <CardTitle>Tokens by response model</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {top.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No token activity in this window"
              description="Widen the time range or clear filters to see top models."
            />
          ) : (
            <BarHorizontal data={top} xKey="tokens" yKey="response_model" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// (helper imported from ./-leaderboard/useFocusActiveRow)
