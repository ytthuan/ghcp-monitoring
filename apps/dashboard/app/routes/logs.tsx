/**
 * /logs route — operator view onto the OTel pipeline.
 *
 *   1. Ingestion health  — one status row per OTel table family
 *      (otel_traces, otel_logs, otel_metrics) with badge (OK / Stale / Down),
 *      last-seen relative time, and a 60-min inline sparkline. Auto-refresh
 *      is opt-in with a user-controlled toggle (persisted in localStorage).
 *   2. Logs              — sticky-header table with severity multi-select,
 *      debounced body search (URL-state), trace_id deep links, j/k row
 *      navigation, and default-redacted body cells (telemetry safety).
 *
 * No CSV export is provided here: log bodies may carry user-authored content
 * and we don't want a one-click bulk-export of potentially sensitive data.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronDown,
  ExternalLink,
  Filter,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";
import { useFilters } from "~/lib/use-filters";
import { useTimezone, formatTimestampInTz } from "~/lib/use-timezone";
import { cn } from "~/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { ChartSkeleton, TableSkeleton } from "~/components/layout/Skeletons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { EmptyState } from "~/components/layout/EmptyState";
import { SortHeader } from "./-leaderboard/SortHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  getIngestionHealth,
  getLogs,
  type IngestionTableStats,
  type LogSortColumn,
} from "~/server/queries/logs";
import { LogBodyCell } from "./-logs/LogBodyCell";

export const Route = createFileRoute("/logs")({
  component: LogsPage,
});

// ─── Constants ────────────────────────────────────────────────────────────

/** ≤ this many seconds since the last row → ingestion is OK. */
const FRESH_OK_SECONDS = 60;
/** ≤ this many seconds since the last row → ingestion is Stale (warn). */
const FRESH_STALE_SECONDS = 600;
/** Polling cadence for the ingestion health card (ms). */
const HEALTH_REFETCH_MS = 15_000;
/** localStorage key for the auto-refresh pause toggle. */
const AUTO_REFRESH_KEY = "dashboard:logs:autoRefresh";
/** Debounce window for the body search input (ms). */
const SEARCH_DEBOUNCE_MS = 250;
/** Known severity levels surfaced by the multi-select. */
const KNOWN_SEVERITIES = [
  "TRACE",
  "DEBUG",
  "INFO",
  "WARN",
  "ERROR",
  "FATAL",
] as const;
type Severity = (typeof KNOWN_SEVERITIES)[number];

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatRelative(secs: number | null): string {
  if (secs == null) return "no data (24h)";
  if (secs < 0) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type HealthStatus = "ok" | "stale" | "down";

function statusFor(secs: number | null): HealthStatus {
  if (secs == null || secs > FRESH_STALE_SECONDS) return "down";
  if (secs > FRESH_OK_SECONDS) return "stale";
  return "ok";
}

function statusBadgeClass(s: HealthStatus): string {
  switch (s) {
    case "ok":
      return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400";
    case "stale":
      return "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300";
    case "down":
      return "bg-destructive/15 text-destructive border-destructive/30";
  }
}

function statusLabel(s: HealthStatus): string {
  return s === "ok" ? "OK" : s === "stale" ? "Stale" : "Down";
}

function severityBadgeClass(sev: string): string {
  const s = (sev || "").toUpperCase();
  if (s === "ERROR" || s === "FATAL")
    return "bg-destructive/15 text-destructive border-destructive/30";
  if (s === "WARN" || s === "WARNING")
    return "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300";
  if (s === "DEBUG" || s === "TRACE")
    return "bg-muted/60 text-muted-foreground border-transparent";
  // INFO / unknown / empty
  return "bg-muted text-muted-foreground border-transparent";
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

// ─── Page ─────────────────────────────────────────────────────────────────

function LogsPage() {
  return (
    <div className="space-y-4">
      <IngestionHealthCard />
      <LogsTableCard />
    </div>
  );
}

// ─── Ingestion health ─────────────────────────────────────────────────────

function useAutoRefresh(): {
  enabled: boolean;
  toggle: () => void;
} {
  const [enabled, setEnabled] = useState<boolean>(false);
  // Hydrate from localStorage on mount (SSR-safe).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AUTO_REFRESH_KEY);
      if (raw === "false") setEnabled(false);
      else if (raw === "true") setEnabled(true);
    } catch {
      /* ignore */
    }
  }, []);
  // Persist on every change. Skip the very first render (which is just the
  // hydration default) to avoid clobbering an existing localStorage value
  // before hydration runs.
  const didHydrate = useRef(false);
  useEffect(() => {
    if (!didHydrate.current) {
      didHydrate.current = true;
      return;
    }
    try {
      window.localStorage.setItem(AUTO_REFRESH_KEY, String(enabled));
    } catch {
      /* ignore */
    }
  }, [enabled]);
  const toggle = useCallback(() => {
    setEnabled((prev) => !prev);
  }, []);
  return { enabled, toggle };
}

interface SparkPoint {
  minute: string;
  traces: number;
  logs: number;
  metrics: number;
}

interface RolledRow {
  /** Display name. */
  name: "otel_traces" | "otel_logs" | "otel_metrics";
  status: HealthStatus;
  seconds_since_latest: number | null;
  rows_24h: number;
  /** Sparkline series key into SparkPoint. */
  seriesKey: "traces" | "logs" | "metrics";
}

/** Roll up `otel_metrics_*` family into a single `otel_metrics` row. */
function rollUp(tables: IngestionTableStats[]): RolledRow[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const traces = byName.get("otel_traces");
  const logs = byName.get("otel_logs");
  const metricsTables = tables.filter((t) => t.name.startsWith("otel_metrics"));

  const rolledMetrics: RolledRow = (() => {
    const freshSecs = metricsTables
      .map((t) => t.seconds_since_latest)
      .filter((v): v is number => v != null);
    const seconds = freshSecs.length > 0 ? Math.min(...freshSecs) : null;
    const rows24 = metricsTables.reduce((acc, t) => acc + (t.rows_24h ?? 0), 0);
    return {
      name: "otel_metrics",
      status: statusFor(seconds),
      seconds_since_latest: seconds,
      rows_24h: rows24,
      seriesKey: "metrics",
    };
  })();

  const out: RolledRow[] = [];
  if (traces) {
    out.push({
      name: "otel_traces",
      status: statusFor(traces.seconds_since_latest),
      seconds_since_latest: traces.seconds_since_latest,
      rows_24h: traces.rows_24h,
      seriesKey: "traces",
    });
  }
  if (logs) {
    out.push({
      name: "otel_logs",
      status: statusFor(logs.seconds_since_latest),
      seconds_since_latest: logs.seconds_since_latest,
      rows_24h: logs.rows_24h,
      seriesKey: "logs",
    });
  }
  out.push(rolledMetrics);
  return out;
}

function IngestionHealthCard() {
  const { tz } = useTimezone();
  const { enabled, toggle } = useAutoRefresh();
  const health = useQuery({
    queryKey: ["ingestion-health"],
    queryFn: () => getIngestionHealth(),
    staleTime: 5_000,
    // React Query owns the interval — flipping `enabled` tears it down.
    refetchInterval: enabled ? HEALTH_REFETCH_MS : false,
    refetchIntervalInBackground: false,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Last 60 min
          </div>
          <CardTitle>Ingestion health</CardTitle>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {health.data
              ? `As of ${formatTimestampInTz(health.data.fetchedAt, tz)}`
              : health.isLoading
                ? "Loading…"
                : "—"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            data-testid="logs-autorefresh-toggle"
            aria-label={
              enabled ? "Pause auto-refresh" : "Resume auto-refresh"
            }
            aria-pressed={enabled}
            onClick={toggle}
          >
            {enabled ? (
              <>
                <Pause className="h-3 w-3" aria-hidden />
                Auto-refreshing every 15s
              </>
            ) : (
              <>
                <Play className="h-3 w-3" aria-hidden />
                Auto-refresh paused
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            aria-label="Refresh now"
            disabled={health.isFetching}
            onClick={() => void health.refetch()}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", health.isFetching && "animate-spin")}
              aria-hidden
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {health.isLoading ? (
          <ChartSkeleton height={160} />
        ) : health.error ? (
          <p className="text-sm text-destructive">
            Couldn&apos;t load ingestion health — {(health.error as Error).message}
          </p>
        ) : !health.data ? (
          <EmptyState
            title="No ingestion data yet"
            description="Send Copilot traffic through the collector to populate the OTel tables."
          />
        ) : (
          <StatusRows
            rows={rollUp(health.data.tables)}
            sparkline={health.data.sparkline}
            tz={tz}
          />
        )}
      </CardContent>
    </Card>
  );
}

function StatusRows({
  rows,
  sparkline,
  tz,
}: {
  rows: RolledRow[];
  sparkline: ReadonlyArray<SparkPoint>;
  tz: string;
}) {
  return (
    <div
      role="list"
      data-testid="ingestion-status-rows"
      className="divide-y rounded-md border"
    >
      {rows.map((r) => (
        <div
          key={r.name}
          role="listitem"
          data-testid={`ingestion-row-${r.name}`}
          data-status={r.status}
          className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs sm:flex-nowrap"
        >
          <span className="min-w-[110px] truncate font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {r.name}
          </span>
          <Badge
            variant="outline"
            data-testid={`ingestion-badge-${r.name}`}
            className={cn("h-5 rounded-sm px-1.5 text-[10px]", statusBadgeClass(r.status))}
          >
            {statusLabel(r.status)}
          </Badge>
          <span
            className="tabular-nums text-muted-foreground"
            title={
              r.seconds_since_latest != null
                ? `${r.seconds_since_latest}s since last row`
                : "no rows in last 24h"
            }
          >
            {formatRelative(r.seconds_since_latest)}
          </span>
          <span className="hidden text-muted-foreground sm:inline">·</span>
          <span className="tabular-nums text-muted-foreground">
            {r.rows_24h.toLocaleString()} rows / 24h
          </span>
          <div className="ml-auto h-8 w-[120px] shrink-0">
            <InlineSparkline data={sparkline} dataKey={r.seriesKey} tz={tz} />
          </div>
        </div>
      ))}
    </div>
  );
}

function InlineSparkline({
  data,
  dataKey,
  tz,
}: {
  data: ReadonlyArray<SparkPoint>;
  dataKey: "traces" | "logs" | "metrics";
  tz: string;
}) {
  const colorVar = useMemo(() => {
    if (dataKey === "traces") return "hsl(var(--chart-1))";
    if (dataKey === "logs") return "hsl(var(--chart-2))";
    return "hsl(var(--chart-4))";
  }, [dataKey]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data as SparkPoint[]} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <XAxis dataKey="minute" hide />
        <YAxis hide />
        <Tooltip
          cursor={{ stroke: "hsl(var(--border))" }}
          contentStyle={{
            fontSize: 11,
            padding: "4px 6px",
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            color: "hsl(var(--popover-foreground))",
          }}
          labelFormatter={(v) =>
            typeof v === "string" ? formatTimestampInTz(v, tz) : ""
          }
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={colorVar}
          fill={colorVar}
          fillOpacity={0.3}
          strokeWidth={1.25}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Logs table ───────────────────────────────────────────────────────────

interface LogsUrlState {
  q: string;
  severities: Severity[];
  sortBy: LogSortColumn;
  sortDir: "asc" | "desc";
}

const SORTABLE_LOG_COLUMNS = ["timestamp", "severity", "service_name"] as const;

function parseSortBy(raw: string | null): LogSortColumn {
  return SORTABLE_LOG_COLUMNS.includes(raw as LogSortColumn)
    ? (raw as LogSortColumn)
    : "timestamp";
}

function parseSortDir(raw: string | null): "asc" | "desc" {
  return raw === "asc" ? "asc" : "desc";
}

function parseSeverities(csv: string | undefined): Severity[] {
  if (!csv) return [];
  const set = new Set(KNOWN_SEVERITIES as readonly string[]);
  return csv
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is Severity => set.has(s));
}

/**
 * UI-only URL state for the logs page. Bypasses TanStack Router's
 * per-route `validateSearch` (which only accepts global Filters keys) by
 * driving `window.history.replaceState` directly — same pattern used by
 * the calls page for its column-visibility persistence.
 */
function useLogsUrlState(): {
  state: LogsUrlState;
  setQ: (q: string) => void;
  setSeverities: (next: Severity[]) => void;
  setSort: (sortBy: LogSortColumn, sortDir: "asc" | "desc") => void;
} {
  const [state, setState] = useState<LogsUrlState>(() => {
    if (typeof window === "undefined")
      return { q: "", severities: [], sortBy: "timestamp", sortDir: "desc" };
    const params = new URLSearchParams(window.location.search);
    return {
      q: params.get("q") ?? "",
      severities: parseSeverities(params.get("severities") ?? undefined),
      sortBy: parseSortBy(params.get("sortBy")),
      sortDir: parseSortDir(params.get("sortDir")),
    };
  });

  const writeToUrl = useCallback((next: LogsUrlState) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (next.q) params.set("q", next.q);
    else params.delete("q");
    if (next.severities.length > 0) params.set("severities", next.severities.join(","));
    else params.delete("severities");
    if (next.sortBy === "timestamp" && next.sortDir === "desc") {
      params.delete("sortBy");
      params.delete("sortDir");
    } else {
      params.set("sortBy", next.sortBy);
      params.set("sortDir", next.sortDir);
    }
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const setQ = useCallback(
    (q: string) => {
      setState((prev) => {
        const next = { ...prev, q };
        writeToUrl(next);
        return next;
      });
    },
    [writeToUrl],
  );
  const setSeverities = useCallback(
    (severities: Severity[]) => {
      setState((prev) => {
        const next = { ...prev, severities };
        writeToUrl(next);
        return next;
      });
    },
    [writeToUrl],
  );
  const setSort = useCallback(
    (sortBy: LogSortColumn, sortDir: "asc" | "desc") => {
      setState((prev) => {
        const next = { ...prev, sortBy, sortDir };
        writeToUrl(next);
        return next;
      });
    },
    [writeToUrl],
  );
  return { state, setQ, setSeverities, setSort };
}

function sortAria(
  active: boolean,
  dir: "asc" | "desc",
): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return dir === "asc" ? "ascending" : "descending";
}

function SortableLogHead({
  column,
  label,
  sortBy,
  sortDir,
  onSort,
}: {
  column: LogSortColumn;
  label: string;
  sortBy: LogSortColumn;
  sortDir: "asc" | "desc";
  onSort: (sortBy: LogSortColumn, sortDir: "asc" | "desc") => void;
}) {
  const active = sortBy === column;
  const nextDir = active && sortDir === "asc" ? "desc" : "asc";
  return (
    <TableHead aria-sort={sortAria(active, sortDir)}>
      <SortHeader
        label={label}
        active={active}
        dir={active ? sortDir : null}
        onClick={() => onSort(column, nextDir)}
      />
    </TableHead>
  );
}

function LogsTableCard() {
  const { filters } = useFilters();
  const { tz } = useTimezone();
  const navigate = useNavigate();
  const { state: urlState, setQ, setSeverities, setSort } = useLogsUrlState();
  const urlQ = urlState.q;
  const urlSeverities = urlState.severities;
  const sortBy = urlState.sortBy;
  const sortDir = urlState.sortDir;

  // Local input state (mirrors URL). Debounced before pushing back to the URL
  // so we don't churn history entries while the user types.
  const [searchInput, setSearchInput] = useState(urlQ);
  const debouncedInput = useDebounced(searchInput, SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    if (debouncedInput !== urlQ) setQ(debouncedInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedInput]);

  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 50;

  // Reset to first page whenever the effective search/severity/sort changes.
  useEffect(() => {
    setPageIndex(0);
  }, [urlQ, urlSeverities, sortBy, sortDir]);

  const q = useQuery({
    queryKey: ["logs", filters, urlQ, urlSeverities, pageIndex, sortBy, sortDir],
    queryFn: () =>
      getLogs({
        data: {
          filters,
          search: urlQ,
          severities: urlSeverities,
          pageIndex,
          pageSize,
          sortBy,
          sortDir,
        },
      }),
  });

  const visibleRows = useMemo(() => {
    return q.data?.rows ?? [];
  }, [q.data]);

  const total = q.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // ── Keyboard row navigation (j/k + Enter → trace) ────────────────────
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    setActiveIndex(0);
  }, [urlQ, urlSeverities, pageIndex, q.dataUpdatedAt]);

  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, visibleRows.length);
  }, [visibleRows.length]);

  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      if (visibleRows.length === 0) return;
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(visibleRows.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        const row = visibleRows[activeIndex];
        if (row && row.trace_id) {
          e.preventDefault();
          void navigate({
            to: "/traces/$traceId",
            params: { traceId: row.trace_id },
          });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleRows, activeIndex, navigate]);

  useEffect(() => {
    const el = rowRefs.current[activeIndex];
    if (el) el.focus({ preventScroll: false });
  }, [activeIndex]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Logs</CardTitle>
          <p className="text-xs text-muted-foreground">
            Use <kbd className="rounded border px-1 text-[10px]">j</kbd>{" / "}
            <kbd className="rounded border px-1 text-[10px]">k</kbd> to move,{" "}
            <kbd className="rounded border px-1 text-[10px]">Enter</kbd> to open the trace
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <SeverityFilter selected={urlSeverities} onChange={setSeverities} />
          <Input
            data-testid="logs-search"
            placeholder="Search log body…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-8 w-full max-w-xs"
            aria-label="Search log body"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {q.isLoading && !q.data ? (
          <TableSkeleton rows={10} cols={6} />
        ) : q.error ? (
          <p className="text-sm text-destructive">
            Couldn&apos;t load logs — {(q.error as Error).message}
          </p>
        ) : (
          <>
            <div className="relative max-h-[70vh] overflow-auto rounded-md border">
              <Table data-testid="logs-table" className="min-w-full">
                <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]">
                  <TableRow>
                    <SortableLogHead
                      column="timestamp"
                      label="Time"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <SortableLogHead
                      column="severity"
                      label="Severity"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <SortableLogHead
                      column="service_name"
                      label="Service"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <TableHead>Body</TableHead>
                    <TableHead>Trace</TableHead>
                    <TableHead>Attrs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-0">
                        <EmptyState
                          title="No logs match this filter"
                          description={
                            urlQ || urlSeverities.length > 0
                              ? "Adjust the search term, severity filter, or time range."
                              : "Nothing in otel_logs for the current time range."
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleRows.map((r, i) => {
                      const sevClass = severityBadgeClass(r.severity);
                      const sevLabel = (r.severity || "INFO").toUpperCase();
                      const attrs = Object.entries(r.log_attributes);
                      const shown = attrs.slice(0, 3);
                      const extra = attrs.length - shown.length;
                      const isActive = i === activeIndex;
                      return (
                        <TableRow
                          key={`${r.span_id || r.trace_id || r.timestamp}-${r.timestamp}-${i}`}
                          ref={(el) => {
                            rowRefs.current[i] = el;
                          }}
                          tabIndex={isActive ? 0 : -1}
                          data-active={isActive || undefined}
                          data-testid="logs-row"
                          onFocus={() => setActiveIndex(i)}
                          className="cursor-default transition-colors data-[active=true]:bg-muted hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                            {formatTimestampInTz(r.timestamp, tz)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "h-5 rounded-sm px-1.5 text-[10px]",
                                sevClass,
                              )}
                            >
                              {sevLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {r.service_name || "—"}
                          </TableCell>
                          <TableCell className="max-w-[480px]">
                            <LogBodyCell body={r.body} severity={r.severity} />
                          </TableCell>
                          <TableCell>
                            {r.trace_id ? (
                              <Link
                                to="/traces/$traceId"
                                params={{ traceId: r.trace_id }}
                                className="inline-flex items-center gap-1 rounded-sm font-mono text-xs text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={`Open trace ${r.trace_id}`}
                                title={r.trace_id}
                              >
                                {r.trace_id.slice(0, 8)}…
                                <ExternalLink className="h-3 w-3" aria-hidden />
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {shown.map(([k, v]) => (
                                <span
                                  key={k}
                                  className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                                  title={`${k}=${v}`}
                                >
                                  {k}={v.length > 24 ? `${v.slice(0, 24)}…` : v}
                                </span>
                              ))}
                              {extra > 0 ? (
                                <span className="text-[10px] text-muted-foreground">
                                  +{extra} more
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <div className="tabular-nums">
                Page {pageIndex + 1} of {pageCount} — {total.toLocaleString()} total
                {urlSeverities.length > 0 && q.data
                  ? ` · ${visibleRows.length} shown after severity filter`
                  : ""}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                >
                  Prev
                </Button>
                <span className="tabular-nums">
                  Page {pageIndex + 1}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pageIndex + 1 >= pageCount}
                  onClick={() => setPageIndex((p) => p + 1)}
                  aria-label="Next page"
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SeverityFilter({
  selected,
  onChange,
}: {
  selected: Severity[];
  onChange: (next: Severity[]) => void;
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const label =
    selected.length === 0
      ? "All severities"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} severities`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs"
          data-testid="logs-severity-filter"
          aria-label="Filter by severity"
        >
          <Filter className="h-3 w-3" aria-hidden />
          {label}
          <ChevronDown className="h-3 w-3 opacity-50" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Severity</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {KNOWN_SEVERITIES.map((sev) => {
          const checked = selectedSet.has(sev);
          return (
            <DropdownMenuCheckboxItem
              key={sev}
              data-testid={`logs-sev-opt-${sev}`}
              checked={checked}
              onCheckedChange={(v) => {
                const next = new Set(selectedSet);
                if (v) next.add(sev);
                else next.delete(sev);
                // Preserve canonical order.
                onChange(KNOWN_SEVERITIES.filter((s) => next.has(s)));
              }}
            >
              {sev}
            </DropdownMenuCheckboxItem>
          );
        })}
        {selected.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
              onClick={() => onChange([])}
            >
              Clear selection
            </button>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
