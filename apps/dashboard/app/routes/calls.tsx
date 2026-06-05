import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Columns3,
  Download,
  Search,
} from "lucide-react";
import { useFilters } from "~/lib/use-filters";
import { useTimezone, formatTimestampInTz } from "~/lib/use-timezone";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { TableSkeleton } from "~/components/layout/Skeletons";
import { EmptyState } from "~/components/layout/EmptyState";
import { RevealableCell } from "~/components/data/RevealableCell";
import { FormatCell } from "~/components/data/FormatCell";
import { CostCell } from "~/components/data/CostCell";
import { estimateCostBreakdown } from "~/server/pricing";
import { cn } from "~/lib/utils";
import { formatCredits, formatNumber } from "~/lib/format";
import { FiltersSchema, type CallRow, type Filters } from "~/lib/types";
import { z } from "zod";
import { useKeyboardRowNav } from "./-calls/useKeyboardRowNav";
import { useUrlColumnVisibility } from "./-calls/useUrlColumnVisibility";
import {
  buildCallsCsv,
  csvFilename,
  downloadCsv,
} from "./-calls/exportCsv";

const ArgsSchema = z.object({
  filters: FiltersSchema,
  pageIndex: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(200).default(50),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});
type Args = z.infer<typeof ArgsSchema>;

const fetchCalls = createServerFn({ method: "POST" })
  .inputValidator((d: Args) => ArgsSchema.parse(d))
  .handler(async ({ data }) => {
    const { getCalls } = await import("~/server/queries/calls");
    return getCalls({
      filters: data.filters as Filters,
      pageIndex: data.pageIndex,
      pageSize: data.pageSize,
      sortBy: data.sortBy as keyof CallRow | undefined,
      sortDir: data.sortDir,
    });
  });

export const Route = createFileRoute("/calls")({
  component: CallsPage,
});

// All toggleable column ids (must match ColumnDef ids below).
const ALL_COLUMNS = [
  "timestamp",
  "request_model",
  "response_model",
  "input",
  "output",
  "cache_read",
  "cache_create",
  "duration_ms",
  "est_cost",
  "credits",
  "finish_reasons",
  "agent_name",
  "conversation_id",
  "trace_id",
  "content",
  "view_trace",
] as const;
type ColumnId = (typeof ALL_COLUMNS)[number];

const DEFAULT_VISIBLE: ColumnId[] = [
  "timestamp",
  "request_model",
  "input",
  "output",
  "est_cost",
  "credits",
  "duration_ms",
  "content",
  "view_trace",
];

const COLUMN_LABELS: Record<ColumnId, string> = {
  timestamp: "Time",
  request_model: "Request model",
  response_model: "Response model",
  input: "Input",
  output: "Output",
  cache_read: "Cache read",
  cache_create: "Cache create",
  duration_ms: "Duration",
  est_cost: "Est. cost",
  credits: "AI credits",
  finish_reasons: "Finish",
  agent_name: "Agent",
  conversation_id: "Session",
  trace_id: "Trace id",
  content: "Content",
  view_trace: "Trace",
};

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const FILTER_DEFAULTS: Filters = FiltersSchema.parse({});

function CallsPage() {
  const { filters, setFilters } = useFilters();
  const { tz } = useTimezone();
  const navigate = useNavigate();
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 50;
  const [sorting, setSorting] = useState<SortingState>([
    { id: "timestamp", desc: true },
  ]);

  const sort = sorting[0];
  const q = useQuery({
    queryKey: ["calls", filters, pageIndex, sort],
    queryFn: () =>
      fetchCalls({
        data: {
          filters,
          pageIndex,
          pageSize,
          sortBy: sort?.id,
          sortDir: sort?.desc ? "desc" : "asc",
        },
      }),
  });

  const colVis = useUrlColumnVisibility({
    all: ALL_COLUMNS,
    defaults: DEFAULT_VISIBLE,
  });

  // TanStack VisibilityState driven by our URL-backed set.
  const columnVisibility: VisibilityState = useMemo(() => {
    const v: VisibilityState = {};
    for (const id of ALL_COLUMNS) v[id] = colVis.isVisible(id);
    return v;
  }, [colVis]);

  const columns = useMemo<ColumnDef<CallRow>[]>(
    () => [
      {
        id: "timestamp",
        accessorKey: "timestamp",
        header: "Time",
        cell: (c) => (
          <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
            {formatTimestampInTz(c.getValue<string>(), tz)}
          </span>
        ),
      },
      {
        id: "request_model",
        accessorKey: "request_model",
        header: "Request model",
      },
      {
        id: "response_model",
        accessorKey: "response_model",
        header: "Response model",
      },
      {
        id: "input",
        accessorKey: "input",
        header: () => <div className="text-right">Input</div>,
        cell: (c) => (
          <div className="text-right tabular-nums">
            <FormatCell kind="number" value={c.getValue<number>()} />
          </div>
        ),
      },
      {
        id: "output",
        accessorKey: "output",
        header: () => <div className="text-right">Output</div>,
        cell: (c) => (
          <div className="text-right tabular-nums">
            <FormatCell kind="number" value={c.getValue<number>()} />
          </div>
        ),
      },
      {
        id: "cache_read",
        accessorKey: "cache_read",
        header: () => <div className="text-right">Cache read</div>,
        cell: (c) => (
          <div className="text-right tabular-nums">
            <FormatCell kind="number" value={c.getValue<number>()} />
          </div>
        ),
      },
      {
        id: "cache_create",
        accessorKey: "cache_create",
        header: () => <div className="text-right">Cache create</div>,
        cell: (c) => (
          <div className="text-right tabular-nums">
            <FormatCell kind="number" value={c.getValue<number>()} />
          </div>
        ),
      },
      {
        id: "duration_ms",
        accessorKey: "duration_ms",
        header: () => <div className="text-right">Duration</div>,
        cell: (c) => (
          <div className="text-right tabular-nums">
            <FormatCell kind="ms" value={c.getValue<number>()} />
          </div>
        ),
      },
      {
        id: "est_cost",
        header: () => <div className="text-right">Est. cost</div>,
        cell: (c) => {
          const r = c.row.original;
          return (
            <div className="text-right tabular-nums">
              <CostCell
                requestModel={r.request_model}
                responseModel={r.response_model}
                input={r.input}
                output={r.output}
                cache_read={r.cache_read}
                cache_create={r.cache_create}
              />
            </div>
          );
        },
      },
      {
        id: "credits",
        accessorKey: "copilot_cost",
        header: () => <div className="text-right">AI credits</div>,
        cell: (c) => {
          const v = c.row.original.copilot_cost;
          return (
            <div
              className="text-right tabular-nums"
              title="GitHub premium-request billing cost (github.copilot.cost)"
            >
              {v > 0 ? (
                formatCredits(v)
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          );
        },
      },
      {
        id: "finish_reasons",
        accessorKey: "finish_reasons",
        header: "Finish",
      },
      { id: "agent_name", accessorKey: "agent_name", header: "Agent" },
      {
        id: "conversation_id",
        accessorKey: "conversation_id",
        header: "Session",
        cell: (c) => {
          const v = c.getValue<string>();
          return v ? (
            <span className="font-mono text-xs">{v.slice(0, 8)}…</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: "trace_id",
        accessorKey: "trace_id",
        header: "Trace id",
        cell: (c) => (
          <span className="font-mono text-xs text-muted-foreground">
            {(c.getValue<string>() ?? "").slice(0, 12)}
          </span>
        ),
      },
      {
        id: "content",
        header: "Content",
        cell: (c) => <RevealableCell spanId={c.row.original.span_id} />,
      },
      {
        id: "view_trace",
        header: () => <div className="text-right">Trace</div>,
        cell: (c) => {
          const traceId = c.row.original.trace_id;
          if (!traceId) return <div className="text-right text-muted-foreground">—</div>;
          return (
            <div className="text-right">
              <a
                href={`/traces/${traceId}`}
                aria-label={`Open trace ${traceId.slice(0, 8)}`}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100 data-[active=true]:opacity-100",
                  FOCUS_RING,
                )}
                data-testid="open-trace"
              >
                Open trace <ArrowUpRight className="h-3 w-3" aria-hidden />
              </a>
            </div>
          );
        },
      },
    ],
    [tz],
  );

  const table = useReactTable({
    data: q.data?.rows ?? [],
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    manualSorting: true,
    manualPagination: true,
    pageCount: Math.ceil((q.data?.total ?? 0) / pageSize),
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;
  const dataRows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  const openTrace = useCallback(
    (i: number) => {
      const traceId = dataRows[i]?.trace_id;
      if (!traceId) return;
      void navigate({ to: "/traces/$traceId", params: { traceId } });
    },
    [dataRows, navigate],
  );

  const { rowProps } = useKeyboardRowNav(rows.length, openTrace, {
    enabled: rows.length > 0,
  });

  const onExportCsv = useCallback(() => {
    const csv = buildCallsCsv({
      rows: dataRows,
      visibleIds: colVis.visibleArray,
      estCost: (row) =>
        estimateCostBreakdown({
          requestModel: row.request_model,
          responseModel: row.response_model,
          input: row.input,
          output: row.output,
          cache_read: row.cache_read,
          cache_create: row.cache_create,
        })?.cost ?? null,
    });
    downloadCsv(csvFilename(), csv);
  }, [dataRows, colVis.visibleArray]);

  const resetFilters = useCallback(() => {
    setFilters(FILTER_DEFAULTS);
    setPageIndex(0);
  }, [setFilters]);

  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);
  const pageCount = table.getPageCount() || 1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Chat calls</CardTitle>
          <p className="text-xs text-muted-foreground">
            Per-request rows for the current filter window. Click a row or press{" "}
            <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px]">Enter</kbd>{" "}
            to open the trace.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label="Toggle column visibility"
                data-testid="columns-menu-trigger"
                className={cn("gap-1.5", FOCUS_RING)}
              >
                <Columns3 className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Columns</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ALL_COLUMNS.map((id) => (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={colVis.isVisible(id)}
                  onCheckedChange={(checked) => colVis.toggle(id, !!checked)}
                  onSelect={(e) => e.preventDefault()}
                  data-testid={`col-toggle-${id}`}
                >
                  {COLUMN_LABELS[id]}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <div className="px-2 py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full justify-start text-xs"
                  onClick={() => colVis.setAll(DEFAULT_VISIBLE)}
                >
                  Reset to defaults
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={onExportCsv}
            disabled={dataRows.length === 0}
            aria-label="Export visible rows as CSV"
            data-testid="export-csv"
            className={cn("gap-1.5", FOCUS_RING)}
          >
            <Download className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <TableSkeleton rows={10} cols={columns.length} />
        ) : q.error ? (
          (() => {
            throw q.error;
          })()
        ) : (
          <>
            <div
              className="relative max-h-[70vh] overflow-auto rounded-md border"
              data-testid="calls-scroll"
            >
              {/* Use a plain <table> here (not the Table primitive) because
                  the primitive wraps with its own overflow-auto div which
                  becomes the sticky positioning context and breaks
                  sticky-header behavior under our outer scroller. */}
              <table className="w-full min-w-full caption-bottom text-sm">
                <TableHeader
                  className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]"
                  data-testid="calls-sticky-header"
                >
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id}>
                      {hg.headers.map((h) => {
                        const sortDir = h.column.getIsSorted();
                        const canSort = h.column.getCanSort();
                        return (
                          <TableHead
                            key={h.id}
                            className="h-9 px-2 text-xs"
                            aria-sort={
                              sortDir === "asc"
                                ? "ascending"
                                : sortDir === "desc"
                                  ? "descending"
                                  : "none"
                            }
                          >
                            {canSort ? (
                              <button
                                type="button"
                                onClick={h.column.getToggleSortingHandler()}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-sm hover:text-foreground",
                                  FOCUS_RING,
                                )}
                              >
                                {flexRender(
                                  h.column.columnDef.header,
                                  h.getContext(),
                                )}
                                {sortDir === "asc" ? (
                                  <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                                ) : sortDir === "desc" ? (
                                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                                ) : (
                                  <ChevronsUpDown
                                    className="h-3.5 w-3.5 opacity-50"
                                    aria-hidden
                                  />
                                )}
                              </button>
                            ) : (
                              flexRender(
                                h.column.columnDef.header,
                                h.getContext(),
                              )
                            )}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={table.getVisibleLeafColumns().length || 1}
                        className="p-0"
                      >
                        <EmptyState
                          icon={Search}
                          title="No calls in this range"
                          description="Loosen the time range or clear model and agent filters to see results."
                          action={
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={resetFilters}
                              data-testid="empty-reset-filters"
                            >
                              Reset filters
                            </Button>
                          }
                          className="border-0"
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row, i) => {
                      const traceId = row.original.trace_id;
                      const props = rowProps(i);
                      return (
                        <TableRow
                          key={row.id}
                          {...props}
                          onClick={(e) => {
                            // Avoid hijacking clicks on inner buttons / links /
                            // popover triggers (RevealableCell, CostCell, etc.).
                            const target = e.target as HTMLElement;
                            if (
                              target.closest(
                                "button, a, [role=button], details, summary, input, [data-radix-popper-content-wrapper]",
                              )
                            )
                              return;
                            if (traceId)
                              void navigate({
                                to: "/traces/$traceId",
                                params: { traceId },
                              });
                          }}
                          className={cn(
                            "group cursor-pointer outline-none transition-colors",
                            "data-[active=true]:bg-muted",
                            FOCUS_RING,
                          )}
                          data-testid="calls-row"
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell
                              key={cell.id}
                              className="px-2 py-1.5 align-middle text-sm"
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </table>
            </div>
            <div className="mt-2 flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
              <div>
                {total === 0
                  ? "No rows"
                  : `Showing ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)}`}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                  className={FOCUS_RING}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </Button>
                <span className="tabular-nums">
                  Page {pageIndex + 1} of {pageCount}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pageIndex + 1 >= pageCount}
                  onClick={() => setPageIndex((p) => p + 1)}
                  aria-label="Next page"
                  className={FOCUS_RING}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
