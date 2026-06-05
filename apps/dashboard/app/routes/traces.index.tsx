import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { z } from "zod";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Download,
  Search,
} from "lucide-react";
import { useFilters } from "~/lib/use-filters";
import { useTimezone, formatTimestampInTz } from "~/lib/use-timezone";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { TableSkeleton } from "~/components/layout/Skeletons";
import { EmptyState } from "~/components/layout/EmptyState";
import { FormatCell } from "~/components/data/FormatCell";
import { FiltersSchema, type Filters } from "~/lib/types";
import { formatNumber } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { TraceRow, TraceSortColumn } from "~/server/queries/traces";
import { useKeyboardRowNav } from "./-traces/use-keyboard-row-nav";
import {
  buildTracesCsv,
  downloadCsv,
  tracesCsvFilename,
} from "./-traces/csv";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const TraceSortColumnSchema = z.enum([
  "started_at",
  "root_name",
  "root_service",
  "duration_ms",
  "span_count",
  "errors",
  "input",
  "output",
]);

const ArgsSchema = z.object({
  filters: FiltersSchema,
  pageIndex: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(200).default(50),
  sortBy: TraceSortColumnSchema.optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});
type Args = z.infer<typeof ArgsSchema>;

function getTraceSortColumn(id: string | undefined): TraceSortColumn | undefined {
  const parsed = TraceSortColumnSchema.safeParse(id);
  return parsed.success ? parsed.data : undefined;
}

const fetchTraces = createServerFn({ method: "POST" })
  .inputValidator((d: Args) => ArgsSchema.parse(d))
  .handler(async ({ data }) => {
    const { getTraces } = await import("~/server/queries/traces");
    return getTraces({
      filters: data.filters as Filters,
      pageIndex: data.pageIndex,
      pageSize: data.pageSize,
      sortBy: data.sortBy as TraceSortColumn | undefined,
      sortDir: data.sortDir,
    });
  });

export const Route = createFileRoute("/traces/")({
  component: TracesPage,
});

function durationMs(ns: string): number {
  try {
    return Number(BigInt(ns) / 1_000_000n);
  } catch {
    return 0;
  }
}

interface SortableHeaderProps {
  label: string;
  align?: "left" | "right";
  state: "asc" | "desc" | false;
  onToggle: (e: unknown) => void;
}

function SortableHeader({ label, align, state, onToggle }: SortableHeaderProps) {
  const Icon =
    state === "asc"
      ? ChevronUp
      : state === "desc"
        ? ChevronDown
        : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm hover:text-foreground",
        FOCUS_RING,
        align === "right" && "ml-auto",
      )}
      aria-sort={
        state === "asc"
          ? "ascending"
          : state === "desc"
            ? "descending"
            : "none"
      }
    >
      <span>{label}</span>
      <Icon
        className={cn("h-3.5 w-3.5", state === false && "opacity-50")}
        aria-hidden
      />
    </button>
  );
}

function TracesPage() {
  const { filters } = useFilters();
  const { tz } = useTimezone();
  const navigate = useNavigate();
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 50;
  const [sorting, setSorting] = useState<SortingState>([
    { id: "started_at", desc: true },
  ]);
  const sort = sorting[0];
  const sortBy = getTraceSortColumn(sort?.id);

  const q = useQuery({
    queryKey: ["traces", filters, pageIndex, sortBy, sort?.desc],
    queryFn: () =>
      fetchTraces({
        data: {
          filters,
          pageIndex,
          pageSize,
          sortBy,
          sortDir: sort?.desc ? "desc" : "asc",
        },
      }),
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  const columns = useMemo<ColumnDef<TraceRow>[]>(
    () => [
      {
        accessorKey: "started_at",
        header: "Time",
        cell: (c) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
            {formatTimestampInTz(c.getValue<string>(), tz)}
          </span>
        ),
      },
      {
        accessorKey: "root_name",
        header: "Root",
        cell: (c) => {
          const r = c.row.original;
          return (
            <div className="flex items-center gap-1.5">
              <Link
                to="/traces/$traceId"
                params={{ traceId: r.trace_id }}
                className={cn(
                  "font-mono text-xs underline-offset-2 hover:underline rounded-sm",
                  FOCUS_RING,
                )}
                aria-label={`Open trace ${r.trace_id.slice(0, 8)}`}
              >
                {r.root_name || "(unknown)"}
              </Link>
              {!r.root_present && (
                <Badge variant="outline" className="text-[10px]">
                  Partial
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "root_service",
        header: "Service",
        cell: (c) => (
          <span className="text-xs text-muted-foreground">
            {c.getValue<string>()}
          </span>
        ),
      },
      {
        id: "duration_ms",
        accessorFn: (r) => durationMs(r.duration_ns),
        header: () => <div className="text-right">Duration</div>,
        cell: (c) => (
          <div className="text-right">
            <FormatCell kind="ms" value={c.getValue<number>()} />
          </div>
        ),
      },
      {
        accessorKey: "span_count",
        header: () => <div className="text-right">Spans</div>,
        cell: (c) => (
          <div className="text-right">
            <FormatCell kind="number" value={c.getValue<number>()} />
          </div>
        ),
      },
      {
        accessorKey: "errors",
        header: () => <div className="text-right">Errors</div>,
        cell: (c) => {
          const v = c.getValue<number>();
          return (
            <div className="text-right">
              {v > 0 ? (
                <span className="tabular-nums text-destructive">{v}</span>
              ) : (
                <FormatCell kind="number" value={v} />
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "input",
        header: () => <div className="text-right">Input</div>,
        cell: (c) => (
          <div className="text-right">
            <FormatCell kind="number" value={c.getValue<number>()} />
          </div>
        ),
      },
      {
        accessorKey: "output",
        header: () => <div className="text-right">Output</div>,
        cell: (c) => (
          <div className="text-right">
            <FormatCell kind="number" value={c.getValue<number>()} />
          </div>
        ),
      },
    ],
    [tz],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      setPageIndex(0);
      setSorting(updater);
    },
    manualSorting: true,
    manualPagination: true,
    pageCount: Math.ceil(total / pageSize),
    getCoreRowModel: getCoreRowModel(),
  });

  const tableRows = table.getRowModel().rows;
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const openTraceById = useCallback(
    (traceId: string) => {
      void navigate({ to: "/traces/$traceId", params: { traceId } });
    },
    [navigate],
  );

  const { setActiveIndex, rowProps } = useKeyboardRowNav(
    tableRows.length,
    (i) => {
      const r = tableRows[i];
      if (r) openTraceById(r.original.trace_id);
    },
  );

  // Scroll active row into view on j/k.
  const handleSetActive = useCallback(
    (i: number) => {
      setActiveIndex(i);
      const el = rowRefs.current[i];
      el?.scrollIntoView({ block: "nearest" });
    },
    [setActiveIndex],
  );

  const openTraceFromRow = (
    event: MouseEvent<HTMLTableRowElement>,
    traceId: string,
  ) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (window.getSelection()?.toString()) return;
    if ((event.target as HTMLElement).closest("a,button,input,select,textarea")) {
      return;
    }
    openTraceById(traceId);
  };

  const onExportCsv = useCallback(() => {
    if (rows.length === 0) return;
    downloadCsv(tracesCsvFilename(), buildTracesCsv(rows));
  }, [rows]);

  const canPrev = pageIndex > 0;
  const canNext = pageIndex + 1 < table.getPageCount();
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Traces</CardTitle>
          <p className="text-xs text-muted-foreground">
            Press <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">j</kbd>{" "}
            /{" "}
            <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">k</kbd>{" "}
            to move,{" "}
            <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">Enter</kbd>{" "}
            to open
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onExportCsv}
          disabled={rows.length === 0}
          aria-label="Export visible traces to CSV"
          className="shrink-0"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {q.isLoading ? (
          <TableSkeleton rows={10} cols={columns.length} />
        ) : q.error ? (
          (() => {
            throw q.error;
          })()
        ) : (
          <>
            <div className="relative max-h-[70vh] overflow-auto rounded-md border">
              <Table className="min-w-full">
                <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]">
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id}>
                      {hg.headers.map((h) => {
                        const colId = h.column.id;
                        const sortedState = h.column.getIsSorted();
                        const align =
                          colId === "duration_ms" ||
                          colId === "span_count" ||
                          colId === "errors" ||
                          colId === "input" ||
                          colId === "output"
                            ? "right"
                            : "left";
                        const labelMap: Record<string, string> = {
                          started_at: "Time",
                          root_name: "Root",
                          root_service: "Service",
                          duration_ms: "Duration",
                          span_count: "Spans",
                          errors: "Errors",
                          input: "Input",
                          output: "Output",
                        };
                        const label = labelMap[colId] ?? colId;
                        return (
                          <TableHead
                            key={h.id}
                            className={cn(
                              "select-none",
                              align === "right" && "text-right",
                            )}
                          >
                            <div
                              className={cn(
                                "flex items-center",
                                align === "right" && "justify-end",
                              )}
                            >
                              <SortableHeader
                                label={label}
                                align={align}
                                state={sortedState}
                                onToggle={
                                  h.column.getToggleSortingHandler() ??
                                  (() => {})
                                }
                              />
                            </div>
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {tableRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="p-0">
                        <EmptyState
                          icon={Search}
                          title="No traces match these filters"
                          description="Loosen the time range or clear model/agent filters to see results."
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    tableRows.map((row, i) => {
                      const props = rowProps(i);
                      return (
                        <TableRow
                          key={row.id}
                          ref={(el) => {
                            rowRefs.current[i] = el;
                          }}
                          tabIndex={props.tabIndex}
                          data-active={props["data-active"] ?? undefined}
                          onFocus={props.onFocus}
                          onMouseEnter={() => handleSetActive(i)}
                          onClick={(event) =>
                            openTraceFromRow(event, row.original.trace_id)
                          }
                          className={cn(
                            "group cursor-pointer",
                            "data-[active=true]:bg-muted",
                            FOCUS_RING,
                          )}
                          aria-label={`Trace ${row.original.trace_id.slice(0, 8)} — press Enter to open`}
                        >
                          {row.getVisibleCells().map((cell, ci) => (
                            <TableCell key={cell.id} className="relative">
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                              {ci === row.getVisibleCells().length - 1 && (
                                <span
                                  aria-hidden
                                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-data-[active=true]:opacity-100"
                                >
                                  Open detail
                                  <ArrowRight className="h-3 w-3" />
                                </span>
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
              <div className="tabular-nums">
                Showing {from}–{to} of {formatNumber(total)}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canPrev}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </Button>
                <span className="tabular-nums">
                  Page {pageIndex + 1} of {table.getPageCount() || 1}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canNext}
                  onClick={() => setPageIndex((p) => p + 1)}
                  aria-label="Next page"
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
