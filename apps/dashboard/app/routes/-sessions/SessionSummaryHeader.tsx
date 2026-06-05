"use client";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { CopySessionIdButton } from "./CopySessionIdButton";
import { formatCompact, formatUsd } from "~/lib/format";
import { additiveTokenTotal } from "~/lib/token-math";
import type { SessionTurn } from "./types";

interface Props {
  sessionId: string;
  turns: ReadonlyArray<SessionTurn>;
}

function topModels(turns: ReadonlyArray<SessionTurn>): string[] {
  const counts = new Map<string, number>();
  for (const t of turns) {
    const m = t.response_model || t.request_model;
    if (!m || m === "unknown") continue;
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([m]) => m);
}

interface MaybeCacheTurn extends SessionTurn {
  cache_read?: number | null;
  cache_create?: number | null;
  cost_usd?: number | null;
}

export function SessionSummaryHeader({ sessionId, turns }: Props) {
  const turnCount = turns.length;
  let totalTokens = 0;
  let totalCost = 0;
  let anyCost = false;
  for (const raw of turns) {
    const t = raw as MaybeCacheTurn;
    totalTokens += additiveTokenTotal({
      input: Number(t.input) || 0,
      output: Number(t.output) || 0,
      cache_create: Number(t.cache_create) || 0,
    });
    if (t.cost_usd != null && Number.isFinite(Number(t.cost_usd))) {
      anyCost = true;
      totalCost += Number(t.cost_usd);
    }
  }
  const models = topModels(turns);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2 min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Session
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="font-mono text-sm text-foreground truncate"
              data-testid="session-id"
              title={sessionId}
            >
              {sessionId}
            </span>
            <CopySessionIdButton id={sessionId} />
          </div>
          {models.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1" aria-label="Model mix">
              {models.map((m) => (
                <Badge key={m} variant="secondary" className="text-xs">
                  {m}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <dl className="grid grid-cols-3 gap-6 sm:gap-8">
          <Stat label="Turns" value={String(turnCount)} testid="stat-turns" />
          <Stat
            label="Total tokens"
            value={formatCompact(totalTokens)}
            testid="stat-total-tokens"
          />
          <Stat
            label="Est. cost"
            value={anyCost ? formatUsd(totalCost) : "—"}
            testid="stat-cost"
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  testid,
}: {
  label: string;
  value: string;
  testid?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className="text-2xl font-semibold tabular-nums text-foreground"
        data-testid={testid}
      >
        {value}
      </dd>
    </div>
  );
}
