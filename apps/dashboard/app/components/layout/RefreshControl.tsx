"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, type Query } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { ChevronDown, RotateCw } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { formatInTz, useTimezone } from "~/lib/use-timezone";
import { getFreshness, type FreshnessStats } from "~/server/queries/freshness";

const STORAGE_KEY = "ghcp.autoRefreshSec";

const AUTO_OPTIONS: ReadonlyArray<{ label: string; value: number }> = [
  { label: "Off", value: 0 },
  { label: "10s", value: 10 },
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
];

const REPORT_QUERY_PREFIXES = new Set([
  "overview",
  "trend",
  "models",
  "agents",
  "calls",
  "traces",
  "trace",
  "sessions",
  "session",
  "cache",
  "latency",
  "ttft",
  "tools",
  "heatmap",
  "finish",
  "logs",
  "ingestion-health",
]);

const MIN_REFRESH_VISIBLE_MS = 500;

type RefreshStatus = "idle" | "refreshing" | "success" | "error";

function isReportQuery(query: Query): boolean {
  const first = query.queryKey[0];
  return typeof first === "string" && REPORT_QUERY_PREFIXES.has(first);
}

function readStoredAutoRefresh(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return AUTO_OPTIONS.some((o) => o.value === n) ? n : 0;
  } catch {
    return 0;
  }
}

function badgeClass(secs: number | null): string {
  if (secs == null) return "bg-red-500";
  if (secs < 120) return "bg-emerald-500";
  if (secs < 600) return "bg-amber-500";
  return "bg-red-500";
}

function formatRelative(secs: number | null): string {
  if (secs == null) return "no data";
  if (secs < 0) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function RefreshControl() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { tz } = useTimezone();
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>("idle");
  const statusTimerRef = useRef<number | null>(null);
  const refreshRequestIdRef = useRef(0);
  const [autoSec, setAutoSec] = useState<number>(0);

  useEffect(() => {
    setAutoSec(readStoredAutoRefresh());
  }, []);

  const freshness = useQuery<FreshnessStats>({
    queryKey: ["freshness"],
    queryFn: () => getFreshness(),
    staleTime: 5_000,
  });

  const clearStatusTimer = useCallback(() => {
    if (statusTimerRef.current != null) {
      window.clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearStatusTimer, [clearStatusTimer]);

  const settleStatus = useCallback(
    (requestId: number, next: Extract<RefreshStatus, "success" | "error">) => {
      if (refreshRequestIdRef.current !== requestId) return;
      setRefreshStatus(next);
      clearStatusTimer();
      statusTimerRef.current = window.setTimeout(() => {
        if (refreshRequestIdRef.current === requestId) {
          setRefreshStatus("idle");
        }
      }, next === "success" ? 2_500 : 4_000);
    },
    [clearStatusTimer],
  );

  const refreshAll = useCallback(async () => {
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    clearStatusTimer();
    setRefreshStatus("refreshing");
    const startedAt = Date.now();
    try {
      await queryClient.invalidateQueries({
        predicate: isReportQuery,
        refetchType: "none",
      });
      const results = await Promise.allSettled([
        router.invalidate(),
        queryClient.refetchQueries({
          predicate: isReportQuery,
          type: "active",
        }),
        freshness.refetch(),
      ]);
      const failed = results.find((r) => r.status === "rejected");
      if (failed && failed.status === "rejected") throw failed.reason;
      const remaining = MIN_REFRESH_VISIBLE_MS - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
      }
      settleStatus(requestId, "success");
    } catch (error) {
      console.error("[dashboard] refresh failed", error);
      settleStatus(requestId, "error");
    }
  }, [
    clearStatusTimer,
    freshness,
    queryClient,
    router,
    settleStatus,
  ]);

  const refreshRef = useRef(refreshAll);
  refreshRef.current = refreshAll;
  useEffect(() => {
    if (autoSec <= 0) return;
    const id = window.setInterval(() => {
      void refreshRef.current();
    }, autoSec * 1000);
    return () => window.clearInterval(id);
  }, [autoSec]);

  const setAuto = useCallback((value: number) => {
    setAutoSec(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // ignore quota / disabled storage
    }
  }, []);

  // Client-side ticker: re-derives the relative-time label every 15 s so
  // "Last span: 14:35:02 · 3m ago" stays accurate while the user reads the
  // page, without burning a server-fn call.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const data = freshness.data;
  const lastIso = data?.lastSpanAt ?? null;
  void tick;
  const secs = lastIso
    ? Math.max(0, Math.floor((Date.now() - new Date(lastIso).getTime()) / 1000))
    : null;
  const lastShort = lastIso
    ? formatInTz(lastIso, tz, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "—";
  const tooltipLines = [
    lastIso ? `Last span: ${lastIso}` : "No spans recorded yet",
    `Spans in last 5m: ${data?.spansLast5m ?? 0}`,
    autoSec > 0 ? `Auto-refresh every ${autoSec}s` : "Auto-refresh: off",
  ].join("\n");
  const currentAutoLabel =
    AUTO_OPTIONS.find((o) => o.value === autoSec)?.label ?? "Off";
  const isRefreshing = refreshStatus === "refreshing";
  const refreshLabel =
    refreshStatus === "refreshing"
      ? "Refreshing reports"
      : refreshStatus === "success"
        ? "Reports refreshed"
        : refreshStatus === "error"
          ? "Refresh failed"
          : "Refresh data";
  const refreshStatusText =
    refreshStatus === "refreshing"
      ? "Refreshing..."
      : refreshStatus === "success"
        ? "Updated"
        : refreshStatus === "error"
          ? "Failed"
          : "";

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground"
            aria-label={`Last span ${formatRelative(secs)}`}
          >
            <span
              className={cn("h-2 w-2 rounded-full", badgeClass(secs))}
              aria-hidden
            />
            <span className="tabular-nums">
              <span className="hidden sm:inline">Last span: </span>
              {lastShort}
              {lastIso ? (
                <span className="text-muted-foreground/70">
                  {" · "}
                  {formatRelative(secs)}
                </span>
              ) : null}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="whitespace-pre-line text-left">
          {tooltipLines}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={refreshLabel}
            aria-busy={isRefreshing}
            data-testid="refresh-data-button"
            data-refresh-status={refreshStatus}
            onClick={() => void refreshAll()}
            disabled={isRefreshing}
          >
            <RotateCw
              className={cn("h-4 w-4", isRefreshing && "animate-spin")}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{refreshLabel}</TooltipContent>
      </Tooltip>

      <span
        role="status"
        aria-live="polite"
        data-testid="refresh-status"
        className={cn(
          "hidden min-w-12 text-xs sm:inline",
          refreshStatus === "success" && "text-emerald-700 dark:text-emerald-400",
          refreshStatus === "error" && "text-destructive",
          refreshStatus === "refreshing" && "text-muted-foreground",
        )}
      >
        {refreshStatusText}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Auto-refresh interval"
            className="h-9 gap-1 px-2"
          >
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Auto: {currentAutoLabel}
            </span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {AUTO_OPTIONS.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onSelect={() => setAuto(opt.value)}
              className={cn(
                "text-sm",
                opt.value === autoSec && "font-medium",
              )}
            >
              Auto-refresh: {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
