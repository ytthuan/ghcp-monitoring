"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { RevealableCell } from "~/components/data/RevealableCell";
import { FormatCell } from "~/components/data/FormatCell";
import { formatTimestampInTz, useTimezone } from "~/lib/use-timezone";
import { cn } from "~/lib/utils";
import type { SessionTurn } from "./types";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

interface MaybeCacheTurn extends SessionTurn {
  cache_read?: number | null;
  cache_create?: number | null;
}

export function TurnTimeline({ turns }: { turns: ReadonlyArray<SessionTurn> }) {
  const { tz } = useTimezone();
  // Per-turn expanded state — controls only whether the RevealableCell is
  // mounted as an expanded preview slot. The cell itself still defaults to
  // `[redacted, click to reveal]`; expanding does NOT bypass that flow.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const allExpanded = useMemo(() => {
    if (turns.length === 0) return false;
    return turns.every((t) => expanded[t.span_id]);
  }, [turns, expanded]);

  // Reset state if turn set changes (different session).
  useEffect(() => {
    setExpanded({});
  }, [turns]);

  const toggleAll = () => {
    if (allExpanded) {
      setExpanded({});
    } else {
      const next: Record<string, boolean> = {};
      for (const t of turns) next[t.span_id] = true;
      setExpanded(next);
    }
  };

  return (
    <div className="space-y-3" data-testid="turn-timeline">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Turn timeline</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleAll}
          data-testid="expand-all-toggle"
          aria-pressed={allExpanded}
          className={cn("h-8", FOCUS_RING)}
        >
          {allExpanded ? "Collapse all" : "Expand all"}
        </Button>
      </div>

      <ol className="relative space-y-3" aria-label="Session turn timeline">
        {turns.map((turn, idx) => {
          const t = turn as MaybeCacheTurn;
          const isOpen = !!expanded[turn.span_id];
          return (
            <li
              key={turn.span_id}
              data-testid="turn-item"
              className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr]"
            >
              <div className="text-xs text-muted-foreground tabular-nums sm:pt-3 sm:text-right">
                <div className="font-medium text-foreground sm:font-normal sm:text-muted-foreground">
                  #{idx + 1}
                </div>
                <div>{formatTimestampInTz(turn.timestamp, tz)}</div>
              </div>
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-foreground">
                        {turn.request_model || "unknown"}
                      </span>
                      <ArrowRight
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="font-mono text-foreground">
                        {turn.response_model || "unknown"}
                      </span>
                    </div>
                    {turn.finish_reasons ? (
                      <span
                        className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                        title="Finish reason"
                      >
                        {turn.finish_reasons}
                      </span>
                    ) : null}
                  </div>

                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                    <Field label="Input">
                      <FormatCell kind="number" value={turn.input} />
                    </Field>
                    <Field label="Output">
                      <FormatCell kind="number" value={turn.output} />
                    </Field>
                    <Field label="Cache">
                      <span className="tabular-nums">
                        {(Number(t.cache_read) || 0) +
                          (Number(t.cache_create) || 0) || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                    </Field>
                    <Field label="Duration">
                      <FormatCell kind="ms" value={turn.duration_ms} />
                    </Field>
                  </dl>

                  <div className="border-t pt-2">
                    <button
                      type="button"
                      data-testid="show-preview-toggle"
                      aria-expanded={isOpen}
                      aria-controls={`turn-preview-${turn.span_id}`}
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [turn.span_id]: !prev[turn.span_id],
                        }))
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {isOpen ? "Hide preview" : "Show preview"}
                    </button>
                    {isOpen ? (
                      <div
                        id={`turn-preview-${turn.span_id}`}
                        className="pt-2"
                        data-testid="turn-preview"
                      >
                        <RevealableCell spanId={turn.span_id} />
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}
