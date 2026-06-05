import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { ArrowLeft, Copy } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { ChartSkeleton } from "~/components/layout/Skeletons";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { EmptyState } from "~/components/layout/EmptyState";
import {
  Breadcrumbs,
  DetailBackLink,
} from "~/components/layout/Breadcrumbs";
import { SpanWaterfall } from "~/components/data/SpanWaterfall";
import { SpanDetailDialog } from "~/components/data/SpanDetailDialog";
import { useTimezone, formatTimestampInTz } from "~/lib/use-timezone";
import { formatMs, formatNumber } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { SpanRow } from "~/server/queries/traces";
import { AttributeSearchTab } from "./-traces/AttributeSearchTab";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const fetchTraceTree = createServerFn({ method: "POST" })
  .inputValidator((d: { traceId: string }) =>
    z.object({ traceId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { getTraceTree } = await import("~/server/queries/traces");
    return getTraceTree(data.traceId);
  });

export const Route = createFileRoute("/traces/$traceId")({
  component: TraceDetailPage,
});

function copyToClipboard(text: string): void {
  if (typeof navigator === "undefined") return;
  void navigator.clipboard?.writeText(text).catch(() => {
    /* ignore */
  });
}

function topModelOf(spans: SpanRow[]): string | null {
  const counts = new Map<string, number>();
  for (const s of spans) {
    const model =
      s.attributes["gen_ai.response.model"] ||
      s.attributes["gen_ai.request.model"];
    if (!model) continue;
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let best: [string, number] | null = null;
  for (const entry of counts) {
    if (!best || entry[1] > best[1]) best = entry;
  }
  return best ? best[0] : null;
}

function SummaryStat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: "destructive";
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-sm font-medium tabular-nums",
          emphasis === "destructive" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function TraceDetailPage() {
  const { traceId } = Route.useParams();
  const { tz } = useTimezone();
  const [search, setSearch] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [selectedFromSearch, setSelectedFromSearch] = useState<SpanRow | null>(
    null,
  );

  const q = useQuery({
    queryKey: ["trace", traceId],
    queryFn: () => fetchTraceTree({ data: { traceId } }),
  });

  const summary = useMemo(() => {
    if (!q.data || q.data.spans.length === 0) return null;
    let start = BigInt(q.data.spans[0]!.started_at_ns);
    let end = start + BigInt(q.data.spans[0]!.duration_ns);
    let errors = 0;
    for (const s of q.data.spans) {
      const sStart = BigInt(s.started_at_ns);
      const sEnd = sStart + BigInt(s.duration_ns);
      if (sStart < start) start = sStart;
      if (sEnd > end) end = sEnd;
      if (s.status_code === "STATUS_CODE_ERROR") errors += 1;
    }
    const root =
      q.data.spans.find((s) => s.parent_span_id === "") ?? q.data.spans[0]!;
    const startedIso = new Date(Number(start / 1_000_000n)).toISOString();
    const errorSpan = q.data.spans.find(
      (s) => s.status_code === "STATUS_CODE_ERROR" && s.status_message,
    );
    return {
      root,
      startedAt: startedIso,
      durationMs: Number((end - start) / 1_000_000n),
      errors,
      statusMessage: errorSpan?.status_message ?? "",
      topModel: topModelOf(q.data.spans),
    };
  }, [q.data]);

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Breadcrumbs />
        <ChartSkeleton height={400} />
      </div>
    );
  }
  if (q.error) throw q.error;
  if (!q.data || q.data.spans.length === 0) {
    return (
      <div className="space-y-4">
        <DetailBackLink />
        <Breadcrumbs />
        <EmptyState
          title="Trace not found"
          description="This trace id has no spans in the selected source — it may have aged out of retention or never been staged/ingested."
          action={
            <Button asChild size="sm" variant="outline">
              <a href="/traces">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Back to traces
              </a>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DetailBackLink />
      <Breadcrumbs />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span>Trace</span>
            <span className="font-mono text-xs text-muted-foreground">
              {traceId}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copy trace id"
              onClick={() => copyToClipboard(traceId)}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <a
              href={`/calls?trace_id=${traceId}`}
              className={cn(
                "text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground rounded-sm",
                FOCUS_RING,
              )}
            >
              View on calls
            </a>
            {!q.data.root_present && <Badge variant="outline">Partial</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
              <SummaryStat
                label="Root"
                value={
                  <span className="truncate font-mono text-xs" title={summary.root.span_name}>
                    {summary.root.span_name}
                  </span>
                }
              />
              <SummaryStat
                label="Started"
                value={
                  <span className="text-xs">
                    {formatTimestampInTz(summary.startedAt, tz)}
                  </span>
                }
              />
              <SummaryStat
                label="Duration"
                value={formatMs(summary.durationMs)}
              />
              <SummaryStat
                label="Spans"
                value={formatNumber(q.data.spans.length)}
              />
              <SummaryStat
                label="Errors"
                value={summary.errors}
                emphasis={summary.errors > 0 ? "destructive" : undefined}
              />
              <SummaryStat
                label="Top model"
                value={
                  <span className="truncate text-xs" title={summary.topModel ?? ""}>
                    {summary.topModel ?? "—"}
                  </span>
                }
              />
            </div>
          )}
          {summary?.statusMessage && (
            <p className="mt-3 text-xs text-destructive">
              {/* status_message bodies can carry user content; display as-is
                  here only because the operator already navigated to the
                  trace. We do NOT echo it into tooltips elsewhere. */}
              {summary.statusMessage}
            </p>
          )}
        </CardContent>
      </Card>

      {q.data.truncated && (
        <div
          role="alert"
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          Showing first {q.data.spans.length} spans for this trace; more were
          truncated.
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="waterfall" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="waterfall">Waterfall</TabsTrigger>
                <TabsTrigger value="search">Attribute search</TabsTrigger>
              </TabsList>
            </div>

            {/* Keep the waterfall mounted across tab switches so its scroll
                position and any inline filter state persist. */}
            <TabsContent value="waterfall" forceMount className="mt-0 data-[state=inactive]:hidden">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Input
                  type="search"
                  placeholder="Filter spans by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-56 text-xs"
                  aria-label="Filter spans by name"
                />
                <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={errorsOnly}
                    onChange={(e) => setErrorsOnly(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Errors only
                </label>
              </div>
              <SpanWaterfall
                spans={q.data.spans}
                search={search}
                errorsOnly={errorsOnly}
              />
            </TabsContent>

            <TabsContent value="search" className="mt-0">
              <AttributeSearchTab
                spans={q.data.spans}
                onSelectSpan={(s) => setSelectedFromSearch(s)}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* SpanDetailDialog driven by the attribute-search tab. The waterfall
          owns its own dialog instance internally; both reuse the same
          component so redaction policy is identical. */}
      <SpanDetailDialog
        span={selectedFromSearch}
        onOpenChange={(open) => {
          if (!open) setSelectedFromSearch(null);
        }}
      />
    </div>
  );
}
