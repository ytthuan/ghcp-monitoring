"use client";
/**
 * Attribute search for a single trace's spans.
 *
 * The search filters SPANS (by span_name, service_name, or any matching
 * attribute KEY substring or attribute value substring). Result rows
 * intentionally do NOT render attribute VALUES inline — they show only
 * the matched attribute KEYs (chips). Sensitive values stay redacted by
 * the same policy as the SpanDetailDialog: clicking a row opens the
 * dialog where <AttrValue/> handles per-key redaction.
 */
import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { EmptyState } from "~/components/layout/EmptyState";
import { isSensitiveAttr } from "~/components/data/AttrValue";
import type { SpanRow } from "~/server/queries/traces";
import { cn } from "~/lib/utils";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

interface SpanMatch {
  span: SpanRow;
  matchedKeys: string[];
}

function matchSpans(spans: SpanRow[], queryRaw: string): SpanMatch[] {
  const q = queryRaw.trim().toLowerCase();
  if (!q) {
    return spans.map((span) => ({ span, matchedKeys: [] }));
  }
  const out: SpanMatch[] = [];
  for (const span of spans) {
    const matched = new Set<string>();
    let nameHit = false;
    if (
      span.span_name.toLowerCase().includes(q) ||
      span.service_name.toLowerCase().includes(q)
    ) {
      nameHit = true;
    }
    for (const [k, v] of Object.entries(span.attributes)) {
      if (k.toLowerCase().includes(q)) {
        matched.add(k);
        continue;
      }
      // Skip value substring matching for sensitive keys so we never
      // surface raw prompt/response/tool content via the search index.
      if (isSensitiveAttr(k)) continue;
      if (v.toLowerCase().includes(q)) {
        matched.add(k);
      }
    }
    if (nameHit || matched.size > 0) {
      out.push({ span, matchedKeys: Array.from(matched).sort() });
    }
  }
  return out;
}

function durationMs(ns: string): number {
  try {
    return Number(BigInt(ns) / 1_000_000n);
  } catch {
    return 0;
  }
}

export function AttributeSearchTab({
  spans,
  onSelectSpan,
}: {
  spans: SpanRow[];
  onSelectSpan: (span: SpanRow) => void;
}) {
  const [query, setQuery] = React.useState("");
  const matches = React.useMemo(() => matchSpans(spans, query), [spans, query]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search spans by name, service, or attribute…"
            className="h-8 pl-7 text-xs"
            aria-label="Search spans by name, service, or attribute"
          />
        </div>
        <Badge variant="outline" className="text-[11px]">
          {matches.length} of {spans.length}
        </Badge>
      </div>

      {matches.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No spans match this search"
          description="Try a span name, service name, or attribute key like gen_ai.request.model."
        />
      ) : (
        <ul className="divide-y rounded-md border">
          {matches.map(({ span, matchedKeys }) => {
            const ms = durationMs(span.duration_ns);
            const isError = span.status_code === "STATUS_CODE_ERROR";
            return (
              <li key={span.span_id}>
                <button
                  type="button"
                  onClick={() => onSelectSpan(span)}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-accent",
                    FOCUS_RING,
                  )}
                  aria-label={`Open span ${span.span_name} (${ms} ms)`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-xs">
                        {span.span_name}
                      </span>
                      {isError && (
                        <Badge
                          variant="outline"
                          className="border-destructive/40 bg-destructive/10 text-[10px] text-destructive"
                        >
                          Error
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {span.service_name} · {span.span_kind}
                    </div>
                    {matchedKeys.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {matchedKeys.slice(0, 6).map((k) => (
                          <span
                            key={k}
                            className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                          >
                            {k}
                          </span>
                        ))}
                        {matchedKeys.length > 6 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{matchedKeys.length - 6} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {ms} ms
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
