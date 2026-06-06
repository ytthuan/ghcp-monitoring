import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import {
  ArrowUpRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Hash,
  DatabaseZap,
  Coins,
  DollarSign,
  Database,
  Gauge,
  Wrench,
  CalendarRange,
  type LucideIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { useFilters } from "~/lib/use-filters";
import {
  useTimezone,
  resolveQueryTz,
  formatTimestampInTz,
  formatInTz,
} from "~/lib/use-timezone";
import { KpiCard } from "~/components/data/KpiCard";
import { AnimatedNumber } from "~/components/data/AnimatedNumber";
import { FormulaBadge } from "~/components/data/FormulaBadge";
import { EmptyState } from "~/components/layout/EmptyState";
import {
  ChartSkeleton,
  KpiStripSkeleton,
} from "~/components/layout/Skeletons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { AreaStacked } from "~/components/charts/AreaStacked";
import { BarHorizontal } from "~/components/charts/BarHorizontal";
import { Donut } from "~/components/charts/Donut";
import { Heatmap } from "~/components/charts/Heatmap";
import { Histogram } from "~/components/charts/Histogram";
import { Sparkline } from "~/components/charts/Sparkline";
import { TokenCostTimeline, type TokenCostPoint } from "~/components/charts/TokenCostTimeline";
import { CommandStrip } from "~/components/overview/CommandStrip";
import { ActionQueue } from "~/components/overview/ActionQueue";
import { ModelCostBars } from "~/components/overview/ModelCostBars";
import { StackedTokenBar } from "~/components/overview/StackedTokenBar";
import { PercentileBar } from "~/components/overview/PercentileBar";
import { Badge } from "~/components/ui/badge";
import {
  formatCompact,
  formatCredits,
  formatNumber,
  formatMs,
  formatPct,
  formatUsd,
  formatUsdExact,
} from "~/lib/format";
import {
  additiveTokenTotal,
  cacheHitRatio,
  freshInputTokens,
  normalizeCacheReadTokens,
} from "~/lib/token-math";
import { InternalModelBadge } from "~/components/data/InternalModelBadge";
import { FiltersSchema } from "~/lib/types";
import { getFreshness, type FreshnessStats } from "~/server/queries/freshness";
import { isRevealActive } from "~/components/layout/RevealBanner";
import {
  deriveActionItems,
  deriveCommandStrip,
  type ActionItem,
  type DetailRoute,
  type OverviewSignalInput,
} from "~/lib/overview-signals";
import type { OverviewInsights } from "~/server/queries/overview_insights";

const NUM_FULL = new Intl.NumberFormat("en-US");

const OverviewInput = z.object({ filters: FiltersSchema, tz: z.string() });
type OverviewInput = z.infer<typeof OverviewInput>;

const fetchOverview = createServerFn({ method: "POST" })
  .inputValidator((d: OverviewInput) => OverviewInput.parse(d))
  .handler(async ({ data }) => {
    const { filters, tz } = data;
    const { getTotals } = await import("~/server/queries/totals");
    const { getTrend } = await import("~/server/queries/trend");
    const { getFinishReasons } = await import("~/server/queries/finish");
    const { getOverviewInsights } = await import("~/server/queries/overview_insights");
    const { bootstrap } = await import("~/server/bootstrap");
    await bootstrap();

    const [
      totals,
      trend,
      finishRaw,
      insights,
    ] = await Promise.all([
      getTotals(filters),
      getTrend({ filters, tz }),
      getFinishReasons(filters),
      getOverviewInsights({ filters, tz }),
    ]);

    // Cache aggregate.
    const totalRead =
      insights.tokenMix.find((row) => row.name === "cache_read")?.value ?? 0;
    const totalInput =
      insights.tokenMix.find((row) => row.name === "input")?.value ?? 0;
    const cache = {
      totalRead,
      totalInput,
      hitRatio: cacheHitRatio(totalInput, totalRead),
    };

    const latency = {
      p50: insights.performance.chat.p50_ms,
      p90: insights.performance.chat.p90_ms,
      p99: insights.performance.chat.p99_ms,
      calls: insights.performance.chat.count,
    };

    // Top 5 tools / finish reasons.
    const tools = insights.tools
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const finishTotal = finishRaw.reduce((s, r) => s + r.count, 0);
    const finish = finishRaw
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((r) => ({
        ...r,
        pct: finishTotal > 0 ? r.count / finishTotal : 0,
      }));

    return {
      totals,
      trend,
      byModel: insights.modelEconomics.slice(0, 5),
      cache,
      latency,
      tools,
      finish,
      sessions: {
        count: insights.sessionDepth.count,
        avgCallsPerSession: insights.sessionDepth.avgCalls,
      },
      cost: insights.cost,
      insights,
    };
  });

export const Route = createFileRoute("/")({
  component: OverviewPage,
});

type OverviewData = Awaited<ReturnType<typeof fetchOverview>>;

function useRevealActive(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const sync = () => setActive(isRevealActive());
    sync();
    window.addEventListener("copilot-reveal-changed", sync);
    return () => window.removeEventListener("copilot-reveal-changed", sync);
  }, []);
  return active;
}

function OverviewPage() {
  const { filters } = useFilters();
  const { tz } = useTimezone();
  const serverTz = resolveQueryTz(tz);
  const q = useQuery({
    queryKey: ["overview", filters, serverTz],
    queryFn: () => fetchOverview({ data: { filters, tz: serverTz } }),
  });
  // Shares the ["freshness"] cache with the header RefreshControl so the
  // command strip and action queue stay in lock-step with the header badge.
  const freshness = useQuery<FreshnessStats>({
    queryKey: ["freshness"],
    queryFn: () => getFreshness(),
    staleTime: 5_000,
  });
  const revealActive = useRevealActive();

  if (q.isLoading) return <OverviewSkeleton />;
  if (q.error) throw q.error;
  const o = q.data!;
  if (o.totals.calls === 0) {
    return (
      <EmptyState
        title="No telemetry yet"
        description="Run a Copilot command and refresh — the dashboard will fill in within a few seconds."
      />
    );
  }

  const lastIso = freshness.data?.lastSpanAt ?? null;
  const secsSinceSpan = lastIso
    ? Math.max(0, Math.floor((Date.now() - new Date(lastIso).getTime()) / 1000))
    : null;
  const signalInput: OverviewSignalInput = {
    totals: {
      calls: o.totals.calls,
      copilot_cost: o.totals.copilot_cost,
      copilot_cost_calls: o.totals.copilot_cost_calls,
    },
    cost: { total: o.cost.total, unknownModels: o.cost.unknownModels },
    cacheHitRatio: o.cache.hitRatio,
    inputTokens: o.cache.totalInput,
    cacheReadTokens: o.cache.totalRead,
    latency: o.latency,
    cacheSavings: {
      coverage: o.insights.cacheSavings.coverage,
      totalCacheRead: o.insights.cacheSavings.totalCacheRead,
    },
    traceErrors: o.insights.traceShape.largest.reduce((s, t) => s + t.errors, 0),
    freshness: lastIso
      ? {
          lastSpanAt: lastIso,
          secondsSinceLastSpan: secsSinceSpan,
          spansLast5m: freshness.data?.spansLast5m ?? 0,
        }
      : null,
    revealActive,
  };
  const strip = deriveCommandStrip(signalInput);
  const actionItems = deriveActionItems(signalInput);
  const lastSpanLabel = lastIso
    ? formatInTz(lastIso, tz, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";
  const tokenCostSeries = buildTokenCostSeries(o.trend, o.insights.costTrend);

  return (
    <div className="space-y-6">
      <SectionAnchorNav />
      {/* Tier 1 — command center: status, KPIs, primary evidence, action queue. */}
      <section
        id="section-tokens"
        aria-label="Status and headline KPIs"
        className="scroll-mt-[calc(var(--ghcp-filter-bar-height,3.5rem)+4rem)] space-y-4"
        data-anchor-section="tokens"
      >
        <CommandStrip strip={strip} lastSpanLabel={lastSpanLabel} storageOk />
        <Section1 totals={o.totals} cost={o.cost} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
          <PrimaryTimelineCard data={tokenCostSeries} tz={tz} totalCost={o.cost.total} />
          <ActionQueueCard items={actionItems} />
        </div>
      </section>
      {/* Tier 2 — spend / cache / latency snapshot, then deeper analysis. */}
      <section
        id="section-cost"
        aria-label="Spend, cache and latency"
        className="scroll-mt-[calc(var(--ghcp-filter-bar-height,3.5rem)+4rem)] space-y-6"
        data-anchor-section="cost"
      >
        <SectionHeading
          title="Spend, cache & latency snapshot"
          description="The fastest read on what is expensive, what is cached, and what is slow."
        />
        <Section3 byModel={o.byModel} cache={o.cache} latency={o.latency} />
        <MiniMetricRow totals={o.totals} cost={o.cost} insights={o.insights} />
        <TokenCostCockpit insights={o.insights} tz={tz} />
        <Section4 tools={o.tools} finish={o.finish} sessions={o.sessions} />
        <ModelEconomicsCockpit insights={o.insights} />
      </section>
      <section
        id="section-cache"
        aria-label="Cache and performance"
        className="scroll-mt-[calc(var(--ghcp-filter-bar-height,3.5rem)+4rem)] space-y-3"
        data-anchor-section="cache"
      >
        <CachePerformanceCockpit insights={o.insights} />
      </section>
      <section
        id="section-tools"
        aria-label="Tools and agents"
        className="scroll-mt-[calc(var(--ghcp-filter-bar-height,3.5rem)+4rem)] space-y-3"
        data-anchor-section="tools"
      >
        <ToolsAgentsCockpit insights={o.insights} tz={tz} />
      </section>
      <section
        id="section-workload"
        aria-label="Workload shape"
        className="scroll-mt-[calc(var(--ghcp-filter-bar-height,3.5rem)+4rem)] space-y-3"
        data-anchor-section="workload"
      >
        <WorkloadShapeCockpit insights={o.insights} tz={serverTz} />
      </section>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <KpiStripSkeleton n={6} />
      <ChartSkeleton height={288} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <ChartSkeleton key={i} height={192} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <ChartSkeleton key={i} height={192} />
        ))}
      </div>
    </div>
  );
}

function tokenMixValue(insights: OverviewInsights, name: string): number {
  return insights.tokenMix.find((row) => row.name === name)?.value ?? 0;
}

function MiniMetricRow({
  totals,
  cost,
  insights,
}: {
  totals: OverviewData["totals"];
  cost: OverviewData["cost"];
  insights: OverviewData["insights"];
}) {
  const tokens = additiveTokenTotal({
    input: totals.input,
    output: totals.output,
    cache_create: totals.cache_create,
  });
  const tokensPerCall = totals.calls > 0 ? tokens / totals.calls : 0;
  const outputInput = totals.input > 0 ? totals.output / totals.input : 0;
  const cacheRatio = cacheHitRatio(totals.input, totals.cache_read);
  const costPerCall = totals.calls > 0 ? cost.total / totals.calls : 0;
  return (
    <div
      className="grid grid-cols-2 gap-3 lg:grid-cols-5"
      data-testid="overview-mini-metrics"
    >
      <MiniMetric
        label="Tokens / call"
        value={formatCompact(tokensPerCall)}
        hint={`${formatCompact(tokens)} total token events`}
      />
      <MiniMetric
        label="Output / input"
        value={formatPct(outputInput)}
        hint="Completion density"
      />
      <MiniMetric
        label="Cache ratio"
        value={formatPct(cacheRatio)}
        hint="cache_read / prompt input"
      />
      <MiniMetric
        label="Cost / call"
        value={formatUsd(costPerCall)}
        hint={`${cost.unknownModels} unknown priced model${cost.unknownModels === 1 ? "" : "s"}`}
      />
      <MiniMetric
        label="Trace p90"
        value={formatMs(insights.performance.trace.p90_ms)}
        hint={`${formatCompact(insights.performance.trace.count)} traces`}
      />
    </div>
  );
}

function MiniMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="bg-card/90">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
        <div className="mt-1 truncate text-[11px] text-muted-foreground">
          {hint}
        </div>
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------
// Primary evidence — combined token + cost timeline and action queue
// --------------------------------------------------------------------------

function buildTokenCostSeries(
  trend: OverviewData["trend"],
  costTrend: OverviewData["insights"]["costTrend"],
): TokenCostPoint[] {
  const costByBucket = new Map(costTrend.map((c) => [c.bucket, c.cost]));
  return trend.map((t) => ({
    bucket: t.bucket,
    fresh_input: freshInputTokens(t.input, t.cache_read),
    cache_read: normalizeCacheReadTokens(t.input, t.cache_read),
    output: t.output,
    cache_create: t.cache_create,
    cost: Number((costByBucket.get(t.bucket) ?? 0).toFixed(4)),
  }));
}

function PrimaryTimelineCard({
  data,
  tz,
  totalCost,
}: {
  data: TokenCostPoint[];
  tz: string;
  totalCost: number;
}) {
  return (
    <Card data-testid="overview-trend">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Token &amp; cost timeline</CardTitle>
          <CardDescription>
            Stacked token volume with estimated spend overlaid — one story from
            usage to cost.
          </CardDescription>
          <div className="text-sm font-medium tabular-nums text-foreground">
            {formatUsd(totalCost)} estimated this window
          </div>
        </div>
        <Link
          to="/trends"
          search={(prev) => prev}
          className="shrink-0 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          View details
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState
            title="No token activity yet"
            description="The timeline appears once Copilot calls are recorded. If you expected data, widen the time range or clear filters."
          />
        ) : (
          <TokenCostTimeline data={data} tz={tz} />
        )}
      </CardContent>
    </Card>
  );
}

function ActionQueueCard({ items }: { items: ActionItem[] }) {
  const open = items.filter(
    (i) => i.severity === "critical" || i.severity === "warning",
  ).length;
  return (
    <Card data-testid="overview-action-queue" className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>Action queue</CardTitle>
          <CardDescription>
            {open > 0
              ? `${open} item${open === 1 ? "" : "s"} need attention`
              : "Nothing needs attention right now"}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <ActionQueue items={items} />
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------
// Anchor navigation (in-page jump strip)
// --------------------------------------------------------------------------

const ANCHOR_SECTIONS: ReadonlyArray<{
  id: string;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "section-tokens", label: "Tokens", icon: Coins },
  { id: "section-cost", label: "Cost", icon: DollarSign },
  { id: "section-cache", label: "Cache", icon: Database },
  { id: "section-performance", label: "Performance", icon: Gauge },
  { id: "section-tools", label: "Tools", icon: Wrench },
  { id: "section-workload", label: "Workload", icon: CalendarRange },
];

function SectionAnchorNav() {
  // Active section is the topmost one currently intersecting the viewport.
  // IntersectionObserver beats a scroll listener here: it batches work and
  // doesn't run on every scroll frame.
  const [activeId, setActiveId] = useState<string>(ANCHOR_SECTIONS[0]!.id);

  useEffect(() => {
    const sections = ANCHOR_SECTIONS.map((s) =>
      document.getElementById(s.id),
    ).filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    // Use root: null (viewport) with a top margin that accounts for the
    // sticky FilterBar + Header. Sections become "active" once their top
    // crosses ~120px from viewport top.
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry highest in the document that is intersecting.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.target.getBoundingClientRect().top -
              b.target.getBoundingClientRect().top,
          );
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: [0, 0.1, 0.25] },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const onJump = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <nav
      aria-label="Page sections"
      className="sticky top-[calc(var(--ghcp-filter-bar-height,3.5rem)+0.5rem)] z-10 -mx-4 hidden border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:flex sm:flex-wrap sm:items-center sm:gap-2"
      data-testid="overview-anchor-nav"
    >
      {ANCHOR_SECTIONS.map(({ id, label, icon: Icon }) => {
        const active = activeId === id;
        return (
          <button
            key={`${id}-${label}`}
            type="button"
            onClick={() => onJump(id)}
            aria-current={active ? "true" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "border-foreground/20 bg-muted text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

function InsightCard({
  title,
  description,
  eyebrow,
  stat,
  children,
  linkTo,
  linkLabel,
  testId,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  stat?: ReactNode;
  children: ReactNode;
  linkTo?: DetailRoute;
  linkLabel?: string;
  testId?: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1 min-w-0">
          {eyebrow ? (
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </div>
          ) : null}
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
          {stat !== undefined && stat !== null ? (
            <div className="text-sm font-medium tabular-nums text-foreground">
              {stat}
            </div>
          ) : null}
        </div>
        {linkTo && (
          <Link
            to={linkTo}
            search={(prev: Record<string, unknown>) => prev}
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            {linkLabel ?? "View details"}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------
// Section 1 — Headline KPIs
// --------------------------------------------------------------------------

function Section1({
  totals,
  cost,
}: {
  totals: OverviewData["totals"];
  cost: OverviewData["cost"];
}) {
  return (
    <div
      className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-7"
      data-testid="overview-kpis"
    >
      <KpiCard
        label="Σ Input tokens"
        numericValue={totals.input}
        format={formatCompact}
        tooltip={NUM_FULL.format(totals.input)}
        icon={ArrowDownToLine}
        accent="hsl(var(--chart-1))"
        index={0}
      />
      <KpiCard
        label="Σ Output tokens"
        numericValue={totals.output}
        format={formatCompact}
        tooltip={NUM_FULL.format(totals.output)}
        icon={ArrowUpFromLine}
        accent="hsl(var(--chart-2))"
        index={1}
      />
      <KpiCard
        label="Σ Cache read tokens"
        numericValue={totals.cache_read}
        format={formatCompact}
        tooltip={NUM_FULL.format(totals.cache_read)}
        icon={Database}
        accent="hsl(var(--chart-3))"
        index={2}
      />
      <KpiCard
        label="Σ Cache create tokens"
        numericValue={totals.cache_create}
        format={formatCompact}
        tooltip={NUM_FULL.format(totals.cache_create)}
        icon={DatabaseZap}
        accent="hsl(var(--chart-4))"
        index={3}
      />
      <KpiCard
        label="Total calls"
        numericValue={totals.calls}
        format={formatCompact}
        tooltip={NUM_FULL.format(totals.calls)}
        icon={Hash}
        accent="hsl(var(--chart-5))"
        index={4}
      />
      <Card
        className="group anim-enter-up card-interactive relative min-w-0 overflow-hidden"
        style={{ animationDelay: "225ms" }}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] opacity-70 transition-opacity duration-200 group-hover:opacity-100"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, hsl(152 60% 42%), transparent)",
          }}
        />
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Estimated cost</CardTitle>
          <DollarSign
            className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground"
            aria-hidden
          />
        </CardHeader>
        <CardContent>
          <div className="truncate text-2xl font-semibold tabular-nums">
            <AnimatedNumber value={cost.total} format={formatUsd} />
          </div>
        </CardContent>
      </Card>
      <Card
        className="group anim-enter-up card-interactive relative min-w-0 overflow-hidden"
        style={{ animationDelay: "270ms" }}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] opacity-70 transition-opacity duration-200 group-hover:opacity-100"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, hsl(var(--brand-2)), transparent)",
          }}
        />
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>AI Credits (GitHub)</CardTitle>
          <Coins
            className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground"
            aria-hidden
          />
        </CardHeader>
        <CardContent>
          <div
            className="truncate text-2xl font-semibold tabular-nums"
            title={
              totals.copilot_cost_calls < totals.calls
                ? `Premium-request credits billed by GitHub (github.copilot.cost). Observed on ${NUM_FULL.format(totals.copilot_cost_calls)} of ${NUM_FULL.format(totals.calls)} calls — total may be an undercount.`
                : `Premium-request credits billed by GitHub (github.copilot.cost). Observed on all ${NUM_FULL.format(totals.calls)} calls.`
            }
          >
            <AnimatedNumber
              value={totals.copilot_cost}
              format={formatCredits}
            />
          </div>
          {totals.copilot_cost_calls < totals.calls ? (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {formatCompact(totals.copilot_cost_calls)}/
              {formatCompact(totals.calls)} calls reported
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------
// Section 3 — Top models / Cache / Latency
// --------------------------------------------------------------------------

function Section3({
  byModel,
  cache,
  latency,
}: {
  byModel: OverviewData["byModel"];
  cache: OverviewData["cache"];
  latency: OverviewData["latency"];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <TopModelsCard byModel={byModel} />
      <CacheCard cache={cache} />
      <LatencyCard latency={latency} />
    </div>
  );
}

function TopModelsCard({ byModel }: { byModel: OverviewData["byModel"] }) {
  return (
    <Card data-testid="overview-top-models">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Top models</CardTitle>
        <Link
          to="/models"
          search={(prev) => prev}
          className="shrink-0 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          View details
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {byModel.length === 0 ? (
          <EmptyState
              title="No models in this window"
              description="Top models populates as model traffic accumulates."
            />
        ) : (
          <table className="w-full text-xs tabular-nums">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-normal">Model</th>
                <th className="py-1 pr-2 text-right font-normal">Calls</th>
                <th className="py-1 pr-2 text-right font-normal">In</th>
                <th className="py-1 pr-2 text-right font-normal">Out</th>
                <th className="py-1 text-right font-normal">Est. $</th>
              </tr>
            </thead>
            <tbody>
              {byModel.map((row) => (
                <tr
                  key={`${row.request_model}->${row.response_model}`}
                  className="border-t"
                >
                  <td
                    className="max-w-[10rem] truncate py-1 pr-2"
                    title={row.model}
                  >
                    {row.model}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    {formatCompact(row.calls)}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    {formatCompact(row.input)}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    {formatCompact(row.output)}
                  </td>
                  <td className="py-1 text-right">
                    {formatUsd(row.cost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function CacheCard({ cache }: { cache: OverviewData["cache"] }) {
  const denom = cache.totalInput;
  return (
    <Card data-testid="overview-cache">
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CardTitle>Cache efficiency</CardTitle>
          <FormulaBadge formula="cache_read / input" />
        </div>
        <Link
          to="/cache"
          search={(prev) => prev}
          className="shrink-0 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          View details
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {denom === 0 ? (
          <EmptyState
              title="No cache traffic yet"
              description="Cache efficiency appears once prompt-cache reads or writes happen."
            />
        ) : (
          <>
            <div className="text-3xl font-semibold tabular-nums">
              {formatPct(cache.hitRatio)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatCompact(cache.totalRead)} served from cache out of{" "}
              {formatCompact(denom)} prompt input tokens
            </p>
            <div className="mt-4">
              <StackedTokenBar
                segments={[
                  {
                    label: "Fresh input",
                    value: freshInputTokens(cache.totalInput, cache.totalRead),
                    color: "hsl(var(--chart-1))",
                  },
                  {
                    label: "Cache read",
                    value: normalizeCacheReadTokens(cache.totalInput, cache.totalRead),
                    color: "hsl(var(--chart-3))",
                  },
                ]}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LatencyCard({ latency }: { latency: OverviewData["latency"] }) {
  return (
    <Card data-testid="overview-latency">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Chat latency distribution</CardTitle>
        <Link
          to="/latency"
          search={(prev) => prev}
          className="shrink-0 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          View details
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {latency.calls === 0 ? (
          <EmptyState
              title="No latency samples yet"
              description="Latency percentiles appear once chat spans report durations."
            />
        ) : (
          <PercentileBar
            p50={latency.p50}
            p90={latency.p90}
            p99={latency.p99}
            count={latency.calls}
          />
        )}
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------
// Section 4 — Tools / Finish / Sessions
// --------------------------------------------------------------------------

function Section4({
  tools,
  finish,
  sessions,
}: {
  tools: OverviewData["tools"];
  finish: OverviewData["finish"];
  sessions: OverviewData["sessions"];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <ToolsCard tools={tools} />
      <FinishCard finish={finish} />
      <SessionsCard sessions={sessions} />
    </div>
  );
}

function ToolsCard({ tools }: { tools: OverviewData["tools"] }) {
  return (
    <Card data-testid="overview-tools">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Top tools</CardTitle>
        <Link
          to="/tools"
          search={(prev) => prev}
          className="shrink-0 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          View details
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {tools.length === 0 ? (
          <EmptyState
              title="No tools used yet"
              description="Top tools populates as tool calls are recorded."
            />
        ) : (
          <ul className="space-y-1 text-sm">
            {tools.map((t) => (
              <li
                key={t.tool_name}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate" title={t.tool_name}>
                  {t.tool_name}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCompact(t.count)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FinishCard({ finish }: { finish: OverviewData["finish"] }) {
  return (
    <Card data-testid="overview-finish">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Finish reasons</CardTitle>
        <Link
          to="/finish"
          search={(prev) => prev}
          className="shrink-0 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          View details
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {finish.length === 0 ? (
          <EmptyState
              title="No finish reasons yet"
              description="Finish reasons appear once chat completions are recorded."
            />
        ) : (
          <ul className="space-y-1 text-sm">
            {finish.map((f) => (
              <li
                key={f.reason}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate" title={f.reason}>
                  {f.reason}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCompact(f.count)}
                  <span className="ml-1">({formatPct(f.pct)})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SessionsCard({ sessions }: { sessions: OverviewData["sessions"] }) {
  return (
    <Card data-testid="overview-sessions">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Sessions</CardTitle>
        <Link
          to="/sessions"
          search={(prev) => prev}
          className="shrink-0 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          View details
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {sessions.count === 0 ? (
          <EmptyState
              title="No sessions yet"
              description="Sessions appear once Copilot sessions are observed."
            />
        ) : (
          <>
            <div className="text-3xl font-semibold tabular-nums">
              {formatCompact(sessions.count)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(
                Math.round(sessions.avgCallsPerSession * 100) / 100,
              )}{" "}
              calls/session avg
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------
// Deep insight cockpit sections
// --------------------------------------------------------------------------

function TokenCostCockpit({
  insights,
  tz,
}: {
  insights: OverviewData["insights"];
  tz: string;
}) {
  const costTrend = insights.costTrend.map((row) => ({
    bucket: row.bucket,
    cost: Number(row.cost.toFixed(4)),
  }));
  const rawInput = tokenMixValue(insights, "input");
  const cacheRead = tokenMixValue(insights, "cache_read");
  const tokenMix = [
    { name: "Fresh input", value: freshInputTokens(rawInput, cacheRead) },
    { name: "Output", value: tokenMixValue(insights, "output") },
    { name: "Cache read", value: cacheRead },
    { name: "Cache create", value: tokenMixValue(insights, "cache_create") },
    { name: "Reasoning", value: tokenMixValue(insights, "reasoning") },
  ].filter((row) => row.value > 0);
  const totalCost = costTrend.reduce((s, r) => s + r.cost, 0);
  const totalTokens = tokenMix.reduce((s, r) => s + r.value, 0);
  const latestCacheRatioPct = insights.cacheRatioTrend.at(-1)?.value ?? 0;
  return (
    <section className="space-y-3" data-testid="overview-token-cost-cockpit">
      <SectionHeading
        title="Token + cost runway"
        description="Where token volume becomes spend, cache pressure, and throughput."
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <InsightCard
          title="Estimated cost trend"
          description="Per-bucket cost using request/response model pricing and cache rates."
          eyebrow="Selected window"
          stat={`${formatUsd(totalCost)} total`}
          linkTo="/trends"
        >
          {costTrend.length === 0 ? (
            <EmptyState
              title="No cost samples in this window"
              description="Widen the time range or clear filters to see the cost trend."
            />
          ) : (
            <AreaStacked data={costTrend} keys={["cost"]} tz={tz} />
          )}
        </InsightCard>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1">
          <InsightCard
            title="Token mix"
            description="Input, output, cache, and reasoning composition."
            eyebrow="Selected window"
            stat={`${formatCompact(totalTokens)} tokens`}
            linkTo="/trends"
          >
            {tokenMix.length === 0 ? (
              <EmptyState
                title="No token activity yet"
                description="Token mix appears once Copilot calls are recorded."
              />
            ) : (
              <Donut
                data={tokenMix}
                nameKey="name"
                valueKey="value"
                className="h-[240px]"
                innerRadius={48}
                outerRadius={86}
              />
            )}
          </InsightCard>
          <InsightCard
            title="Cache ratio spark"
            description="Cache-read share over the selected window."
            eyebrow="Latest bucket"
            stat={`${formatPct(latestCacheRatioPct / 100)} hit rate`}
            linkTo="/cache"
          >
            {insights.cacheRatioTrend.length === 0 ? (
              <EmptyState
                title="No cache samples yet"
                description="Cache ratio appears once prompt-cache traffic is recorded."
              />
            ) : (
              <>
                <Sparkline
                  data={insights.cacheRatioTrend}
                  stroke="hsl(var(--chart-3))"
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  Latest bucket cache-read ratio
                </p>
              </>
            )}
          </InsightCard>
        </div>
      </div>
    </section>
  );
}

function ModelEconomicsCockpit({
  insights,
}: {
  insights: OverviewData["insights"];
}) {
  const modelBars = insights.modelEconomics.map((row) => ({
    model: row.model,
    tokens: row.tokens,
  }));
  const costShare = insights.modelCostShare.map((row) => ({
    model: row.model,
    cost: Number(row.cost.toFixed(4)),
  }));
  const topModel = modelBars[0];
  const totalKnownCost = costShare.reduce((s, r) => s + r.cost, 0);
  return (
    <section className="space-y-3" data-testid="overview-model-economics">
      <SectionHeading
        title="Model economics"
        description="Which models drive token volume, spend, and per-call efficiency."
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <InsightCard
          title="Model token share"
          eyebrow="By tokens"
          stat={topModel ? `${topModel.model} leads` : undefined}
          linkTo="/models"
        >
          {modelBars.length === 0 ? (
            <EmptyState
              title="No models in this window"
              description="Adjust filters or wait for the next bucket to populate."
            />
          ) : (
            <div className="overflow-x-auto">
              <BarHorizontal
                data={modelBars}
                xKey="tokens"
                yKey="model"
                className="h-[300px] min-w-[320px]"
                marginLeft={40}
                yWidth={120}
              />
            </div>
          )}
        </InsightCard>
        <InsightCard
          title="Model cost share"
          description="Known-price models only."
          eyebrow="By spend"
          stat={`${formatUsd(totalKnownCost)} priced`}
          linkTo="/models"
        >
          {costShare.length === 0 ? (
            <EmptyState
              title="No priced model rows"
              description="No priced model rows in this window — pricing may be missing for the active models."
            />
          ) : (
            <ModelCostBars rows={costShare} />
          )}
        </InsightCard>
        <InsightCard
          title="Efficiency table"
          description="Avg tokens and cost per call, with p90 latency."
          eyebrow="Top 6"
          linkTo="/models"
        >
          {insights.modelEconomics.length === 0 ? (
            <EmptyState
              title="No model efficiency yet"
              description="The efficiency table fills in as model traffic accumulates."
            />
          ) : (
            <CompactModelTable rows={insights.modelEconomics.slice(0, 6)} />
          )}
        </InsightCard>
      </div>
      <CostDecompositionCard rows={insights.modelEconomics.slice(0, 8)} />
    </section>
  );
}

function CostDecompositionCard({
  rows,
}: {
  rows: OverviewData["insights"]["modelEconomics"];
}) {
  const sorted = [...rows].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
  if (sorted.length === 0) {
    return (
      <Card data-testid="overview-cost-decomposition">
        <CardHeader>
          <CardTitle>Cost decomposition by model</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No cost samples in this window"
            description="Cost decomposition fills in once at least one priced model has traffic."
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card data-testid="overview-cost-decomposition">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Cost decomposition by model</CardTitle>
          <CardDescription>
            Per-model spend split into input · output · cache read · cache create.
            Internal Copilot models render Included with a disclosure tooltip.
          </CardDescription>
        </div>
        <Link
          to="/models"
          search={(prev) => prev}
          className="text-sm underline-offset-4 hover:underline"
        >
          See all <ArrowUpRight className="inline h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-normal">Model</th>
              <th className="py-1 pr-3 font-normal text-right">Requests</th>
              <th className="py-1 pr-3 font-normal text-right">Total</th>
              <th className="py-1 pr-3 font-normal text-right">Input</th>
              <th className="py-1 pr-3 font-normal text-right">Output</th>
              <th className="py-1 pr-3 font-normal text-right">Cache read</th>
              <th className="py-1 pr-3 font-normal text-right">Cache create</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.model} className="border-t">
                <td className="py-1 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono" title={r.model}>
                      {r.model}
                    </span>
                    <InternalModelBadge model={r.model} variant="pill" />
                  </div>
                </td>
                <td className="py-1 pr-3 text-right">{formatNumber(r.calls)}</td>
                <td
                  className="py-1 pr-3 text-right"
                  title={formatUsdExact(r.cost)}
                >
                  {formatUsd(r.cost)}
                </td>
                <CostSplitCell
                  tokens={r.input}
                  cost={r.cost_input}
                  isInternal={r.is_internal}
                />
                <CostSplitCell
                  tokens={r.output}
                  cost={r.cost_output}
                  isInternal={r.is_internal}
                />
                <CostSplitCell
                  tokens={r.cache_read}
                  cost={r.cost_cache_read}
                  isInternal={r.is_internal}
                />
                <CostSplitCell
                  tokens={r.cache_create}
                  cost={r.cost_cache_create}
                  isInternal={r.is_internal}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CostSplitCell({
  tokens,
  cost,
  isInternal,
}: {
  tokens: number;
  cost: number | null;
  isInternal: boolean;
}) {
  return (
    <td className="py-1 pr-3 text-right">
      <div className="flex flex-col items-end leading-tight">
        <span>{formatNumber(tokens)}</span>
        <span
          className="text-[11px] text-muted-foreground"
          title={cost == null ? undefined : formatUsdExact(cost)}
        >
          {isInternal ? "Included" : formatUsd(cost)}
        </span>
      </div>
    </td>
  );
}

function CachePerformanceCockpit({
  insights,
}: {
  insights: OverviewData["insights"];
}) {
  const input = tokenMixValue(insights, "input");
  const cacheRead = tokenMixValue(insights, "cache_read");
  const cacheCreate = tokenMixValue(insights, "cache_create");
  const freshInput = freshInputTokens(input, cacheRead);
  const cacheComposition = [
    { label: "Fresh input", value: freshInput, color: "hsl(var(--chart-1))" },
    { label: "Cache read", value: cacheRead, color: "hsl(var(--chart-3))" },
    { label: "Cache create", value: cacheCreate, color: "hsl(var(--chart-4))" },
  ].filter((row) => row.value > 0);
  const savingsKnown = insights.cacheSavings.coverage >= 0.8;
  const cacheHit = cacheHitRatio(input, cacheRead);
  return (
    <section className="space-y-3" data-testid="overview-performance-cockpit">
      <SectionHeading
        title="Cache + performance cockpit"
        description="Prompt cache economics, chat latency, TTFT, first-chunk, and trace shape."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <InsightCard
          title="Cache accounting"
          description="Prompt tokens split into fresh, cache read, and cache write."
          eyebrow="Selected window"
          stat={`${formatPct(cacheHit)} hit rate`}
          linkTo="/cache"
        >
          {cacheComposition.length === 0 ? (
            <EmptyState
              title="No cache traffic yet"
              description="Cache accounting appears once prompt-cache reads or writes are recorded."
            />
          ) : (
            <StackedTokenBar segments={cacheComposition} className="pt-2" />
          )}
        </InsightCard>
        <InsightCard
          title="Estimated cache savings"
          description="Only shown when explicit cache pricing is known."
          eyebrow="Known pricing"
          linkTo="/cache"
        >
          <div className="text-3xl font-semibold tabular-nums">
            {savingsKnown ? formatUsd(insights.cacheSavings.savings) : "—"}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatPct(insights.cacheSavings.coverage)} of cache-read tokens have
            explicit cache discount pricing.
          </p>
        </InsightCard>
      </div>
      <div
        id="section-performance"
        className="grid scroll-mt-[calc(var(--ghcp-filter-bar-height,3.5rem)+4rem)] grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4"
      >
        <InsightCard
          title="Chat duration"
          eyebrow="Percentiles"
          stat={
            insights.performance.chat.count > 0
              ? `${formatMs(insights.performance.chat.p90_ms)} p90`
              : undefined
          }
          linkTo="/latency"
        >
          {insights.performance.chat.count === 0 ? (
            <PercentileGrid summary={insights.performance.chat} />
          ) : (
            <PercentileBar
              p50={insights.performance.chat.p50_ms}
              p90={insights.performance.chat.p90_ms}
              p99={insights.performance.chat.p99_ms}
              count={insights.performance.chat.count}
            />
          )}
        </InsightCard>
        <InsightCard
          title="Streaming start"
          eyebrow="Time to first token"
          stat={
            insights.performance.ttft.count > 0
              ? `${formatMs(insights.performance.ttft.p90_ms)} p90`
              : undefined
          }
          linkTo="/ttft"
        >
          <div className="grid grid-cols-2 gap-3">
            <StreamingMetric
              label="TTFT p90"
              summary={insights.performance.ttft}
            />
            <StreamingMetric
              label="First chunk p90"
              summary={insights.performance.firstChunk}
            />
          </div>
        </InsightCard>
        <InsightCard
          title="Trace duration distribution"
          eyebrow="All traces"
          linkTo="/traces"
        >
          <Histogram
            data={insights.traceShape.durationHistogram}
            className="h-[240px]"
            color="hsl(var(--chart-2))"
          />
        </InsightCard>
        <InsightCard
          title="Trace span-count distribution"
          eyebrow="All traces"
          linkTo="/traces"
        >
          <Histogram
            data={insights.traceShape.spanHistogram}
            className="h-[240px]"
            color="hsl(var(--chart-4))"
          />
        </InsightCard>
      </div>
    </section>
  );
}

function ToolsAgentsCockpit({
  insights,
  tz,
}: {
  insights: OverviewData["insights"];
  tz: string;
}) {
  const toolBars = insights.tools.slice(0, 8).map((row) => ({
    tool: row.tool_name,
    count: row.count,
  }));
  const toolP90 = insights.tools.slice(0, 8).map((row) => ({
    tool: row.tool_name,
    p90_ms: row.p90_ms,
  }));
  const agentBars = insights.agentShare.map((row) => ({
    agent: row.agent_name,
    tokens: row.tokens,
  }));
  const toolTrend = insights.toolTrend.map((row) => ({
    ...row,
    bucket: String(row.bucket),
  }));
  const totalToolCalls = toolBars.reduce((s, r) => s + r.count, 0);
  const slowestTool = toolP90.slice().sort((a, b) => b.p90_ms - a.p90_ms)[0];
  const topAgent = agentBars[0];
  return (
    <section className="space-y-3" data-testid="overview-tools-agents-cockpit">
      <SectionHeading
        title="Tools + agents cockpit"
        description="Operational workload: which tools and agents are doing the work."
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <InsightCard
          title="Tool activity trend"
          eyebrow="Selected window"
          stat={`${formatCompact(totalToolCalls)} tool calls`}
          linkTo="/tools"
        >
          {toolTrend.length === 0 || insights.toolTrendKeys.length === 0 ? (
            <EmptyState
              title="No tool activity in this window"
              description="Tool usage appears once Copilot invokes any tool."
            />
          ) : (
            <AreaStacked
              data={toolTrend}
              keys={insights.toolTrendKeys}
              tz={tz}
            />
          )}
        </InsightCard>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <InsightCard
            title="Top tools"
            eyebrow="By call count"
            stat={toolBars[0] ? `${toolBars[0].tool}` : undefined}
            linkTo="/tools"
          >
            {toolBars.length === 0 ? (
              <EmptyState
                title="No tools used yet"
                description="Top tools appears once tool calls are recorded."
              />
            ) : (
              <div className="overflow-x-auto">
                <BarHorizontal
                  data={toolBars}
                  xKey="count"
                  yKey="tool"
                  className="h-[260px] min-w-[280px]"
                  marginLeft={30}
                  yWidth={92}
                />
              </div>
            )}
          </InsightCard>
          <InsightCard
            title="Tool p90 latency"
            eyebrow="Slowest at top"
            stat={slowestTool ? `${formatMs(slowestTool.p90_ms)} p90` : undefined}
            linkTo="/tools"
          >
            {toolP90.length === 0 ? (
              <EmptyState
                title="No tool latency yet"
                description="Tool latency appears once tool spans report durations."
              />
            ) : (
              <div className="overflow-x-auto">
                <BarHorizontal
                  data={toolP90}
                  xKey="p90_ms"
                  yKey="tool"
                  className="h-[260px] min-w-[280px]"
                  marginLeft={30}
                  yWidth={92}
                />
              </div>
            )}
          </InsightCard>
        </div>
      </div>
      <InsightCard
        title="Agent token share"
        eyebrow="By tokens"
        stat={topAgent ? `${topAgent.agent} leads` : undefined}
        linkTo="/agents"
      >
        {agentBars.length === 0 ? (
          <EmptyState
            title="No agents in this window"
            description="Agent share appears once agent metadata is captured."
          />
        ) : (
          <div className="overflow-x-auto">
            <BarHorizontal
              data={agentBars}
              xKey="tokens"
              yKey="agent"
              className="h-[260px] min-w-[320px]"
              marginLeft={40}
              yWidth={140}
            />
          </div>
        )}
      </InsightCard>
    </section>
  );
}

function WorkloadShapeCockpit({
  insights,
  tz,
}: {
  insights: OverviewData["insights"];
  tz: string;
}) {
  return (
    <section className="space-y-3" data-testid="overview-workload-shape">
      <SectionHeading
        title="Workload shape"
        description="When usage happens, how deep sessions go, and which traces are largest."
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <InsightCard
          title="Day × hour activity heatmap"
          eyebrow="Local timezone"
          linkTo="/heatmap"
        >
          {insights.heatmap.length === 0 ? (
            <EmptyState
              title="No activity in this window"
              description="The heatmap fills in as Copilot calls are recorded across the week."
            />
          ) : (
            <div className="overflow-x-auto">
              <Heatmap data={insights.heatmap} tz={tz} />
            </div>
          )}
        </InsightCard>
        <div className="grid grid-cols-1 gap-4">
          <InsightCard
            title="Session depth"
            eyebrow="Calls per session"
            stat={`${formatCompact(insights.sessionDepth.count)} sessions`}
            linkTo="/sessions"
          >
            <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <div className="text-muted-foreground">Sessions</div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatCompact(insights.sessionDepth.count)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Avg calls</div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatNumber(Math.round(insights.sessionDepth.avgCalls * 10) / 10)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">p90 calls</div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatCompact(insights.sessionDepth.p90Calls)}
                </div>
              </div>
            </div>
            <Histogram
              data={insights.sessionDepth.callsHistogram}
              className="h-[180px]"
              color="hsl(var(--chart-5))"
            />
          </InsightCard>
        </div>
      </div>
      <InsightCard
        title="Largest traces"
        description="Safe fields only: no prompt text, tool arguments, or raw attributes."
        eyebrow="Top by duration"
        linkTo="/traces"
      >
        <LargestTraceTable traces={insights.traceShape.largest} tz={tz} />
      </InsightCard>
    </section>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id?: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2
        id={id}
        className="text-base font-semibold tracking-tight text-foreground"
      >
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function PercentileGrid({ summary }: { summary: OverviewInsights["performance"]["chat"] }) {
  if (summary.count === 0)
    return (
      <EmptyState
        title="No latency samples yet"
        description="Latency percentiles appear once chat spans report durations."
      />
    );
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      {(
        [
          ["p50", summary.p50_ms],
          ["p90", summary.p90_ms],
          ["p99", summary.p99_ms],
        ] as const
      ).map(([label, value]) => (
        <div key={label}>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatMs(value)}
          </div>
        </div>
      ))}
      <div className="col-span-3 mt-2 text-xs text-muted-foreground">
        {formatCompact(summary.count)} raw spans
      </div>
    </div>
  );
}

function StreamingMetric({
  label,
  summary,
}: {
  label: string;
  summary: OverviewInsights["performance"]["ttft"];
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">
        {summary.count > 0 ? formatMs(summary.p90_ms) : "—"}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {summary.count > 0
          ? `${formatCompact(summary.count)} samples`
          : "Signal absent"}
      </div>
    </div>
  );
}

function CompactModelTable({
  rows,
}: {
  rows: OverviewInsights["modelEconomics"];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-xs tabular-nums">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-2 font-normal">Model</th>
            <th className="py-1 pr-2 text-right font-normal">Calls</th>
            <th className="py-1 pr-2 text-right font-normal">Tok/call</th>
            <th className="py-1 pr-2 text-right font-normal">$/call</th>
            <th className="py-1 text-right font-normal">p90</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.model} className="border-t">
              <td className="max-w-[12rem] truncate py-1 pr-2" title={row.model}>
                {row.model}
              </td>
              <td className="py-1 pr-2 text-right">{formatCompact(row.calls)}</td>
              <td className="py-1 pr-2 text-right">
                {formatCompact(row.tokens_per_call)}
              </td>
              <td className="py-1 pr-2 text-right">
                {formatUsd(row.cost_per_call)}
              </td>
              <td className="py-1 text-right">{formatMs(row.p90_ms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LargestTraceTable({
  traces,
  tz,
}: {
  traces: OverviewInsights["traceShape"]["largest"];
  tz: string;
}) {
  if (traces.length === 0)
    return (
      <EmptyState
        title="No traces in this window"
        description="The largest-traces table populates once trace spans are recorded."
      />
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-xs tabular-nums">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-2 font-normal">Trace</th>
            <th className="py-1 pr-2 font-normal">Started</th>
            <th className="py-1 pr-2 font-normal">Root</th>
            <th className="py-1 pr-2 text-right font-normal">Duration</th>
            <th className="py-1 pr-2 text-right font-normal">Spans</th>
            <th className="py-1 text-right font-normal">Errors</th>
          </tr>
        </thead>
        <tbody>
          {traces.map((trace) => (
            <tr key={trace.trace_id} className="border-t">
              <td className="py-1 pr-2">
                <Link
                  to="/traces/$traceId"
                  params={{ traceId: trace.trace_id }}
                  className="font-mono underline-offset-2 hover:underline"
                >
                  {trace.trace_id.slice(0, 8)}
                </Link>
              </td>
              <td className="whitespace-nowrap py-1 pr-2 text-muted-foreground">
                {formatTimestampInTz(trace.started_at, tz)}
              </td>
              <td className="max-w-[18rem] truncate py-1 pr-2" title={trace.root_name}>
                {trace.root_name}
              </td>
              <td className="py-1 pr-2 text-right">{formatMs(trace.duration_ms)}</td>
              <td className="py-1 pr-2 text-right">{formatCompact(trace.span_count)}</td>
              <td className="py-1 text-right">
                {trace.errors > 0 ? (
                  <Badge variant="destructive">{trace.errors}</Badge>
                ) : (
                  "0"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
