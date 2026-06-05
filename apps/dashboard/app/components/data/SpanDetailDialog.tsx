"use client";
/**
 * Centered modal dialog showing the full detail of a single span. Replaces
 * the older right-side <SpanDrawer/>. Tabs:
 *   - Attributes  (span attributes, search + grouped/flat, sensitive redacted)
 *   - Resource    (resource attributes — deployment metadata, never redacted)
 *   - Events      (parallel event arrays + same redaction policy)
 *   - Raw JSON    (whole span scrubbed unless reveal is on, with Copy all)
 *
 * Sensitive-key gating reuses the session-wide reveal flag from
 * <RevealBanner /> (sessionStorage, NEVER localStorage) and exposes a
 * per-cell Reveal button via <AttrValue/>. Both flip the SAME global flag —
 * the banner remains the canonical "you are revealed" indicator.
 */
import * as React from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "~/components/ui/tabs";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  RevealBanner,
  isRevealActive,
  setRevealActive,
} from "~/components/layout/RevealBanner";
import { useTimezone, formatTimestampInTz } from "~/lib/use-timezone";
import {
  AttrValue,
  CopyButton,
  isSensitiveAttr,
} from "~/components/data/AttrValue";
import { cn } from "~/lib/utils";
import type { SpanRow } from "~/server/queries/traces";

const REDACTED_PLACEHOLDER = "[redacted — click reveal banner to show]";

/** Friendly label per attribute prefix (first dot-segment). */
const PREFIX_LABELS: Record<string, string> = {
  gen_ai: "GenAI",
  copilot_chat: "Copilot Chat",
  http: "HTTP",
  rpc: "RPC",
  db: "Database",
  session: "Session",
  host: "Host",
  os: "OS",
};

const DEFAULT_OPEN_PREFIXES = new Set(["gen_ai", "copilot_chat"]);

function useRevealFlag(): boolean {
  const [v, setV] = React.useState(false);
  React.useEffect(() => {
    const sync = () => setV(isRevealActive());
    sync();
    window.addEventListener("copilot-reveal-changed", sync);
    return () => window.removeEventListener("copilot-reveal-changed", sync);
  }, []);
  return v;
}

function scrub(
  attrs: Record<string, string>,
  reveal: boolean,
): Record<string, string> {
  if (reveal) return attrs;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    out[k] = isSensitiveAttr(k) ? REDACTED_PLACEHOLDER : v;
  }
  return out;
}

function prefixOf(key: string): string {
  const dot = key.indexOf(".");
  return dot === -1 ? "other" : key.slice(0, dot);
}

function labelFor(prefix: string): string {
  return PREFIX_LABELS[prefix] ?? (prefix === "other" ? "Other" : prefix);
}

function nsToIso(ns: string): string {
  try {
    const ms = Number(BigInt(ns) / 1_000_000n);
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function StatusBadge({
  code,
  message,
}: {
  code: string;
  message: string;
}) {
  if (code === "STATUS_CODE_OK") {
    return (
      <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
        OK
      </Badge>
    );
  }
  if (code === "STATUS_CODE_ERROR") {
    return (
      <Badge
        title={message || undefined}
        className="border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300"
      >
        ERROR
      </Badge>
    );
  }
  return <Badge variant="outline">UNSET</Badge>;
}

function DurationPill({ ns }: { ns: string }) {
  let ms = 0;
  try {
    ms = Number(BigInt(ns) / 1_000_000n);
  } catch {
    /* ignore */
  }
  return (
    <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
      {ms} ms
    </span>
  );
}

function AttrRow({
  attrKey,
  value,
  reveal,
  scrubSensitive,
}: {
  attrKey: string;
  value: string;
  reveal: boolean;
  scrubSensitive: boolean;
}) {
  return (
    <div className="group flex items-start gap-4 border-b py-2 last:border-b-0">
      <dt className="w-72 shrink-0 break-words font-mono text-xs text-muted-foreground">
        {attrKey}
      </dt>
      <dd className="relative min-w-0 flex-1 pr-8">
        <AttrValue
          attrKey={attrKey}
          value={value}
          reveal={reveal}
          scrubSensitive={scrubSensitive}
        />
        <CopyButton
          value={value}
          label={`Copy value of ${attrKey}`}
          className="absolute right-0 top-0 opacity-60 group-hover:opacity-100"
        />
      </dd>
    </div>
  );
}

interface AttrSectionProps {
  attrs: Record<string, string>;
  reveal: boolean;
  scrubSensitive: boolean;
  /** Toggle controls only render when there is more than 1 prefix group. */
  enableToolbar?: boolean;
}

function AttrSection({
  attrs,
  reveal,
  scrubSensitive,
  enableToolbar = true,
}: AttrSectionProps) {
  const [search, setSearch] = React.useState("");
  const [view, setView] = React.useState<"grouped" | "flat">("grouped");

  const allKeys = React.useMemo(() => Object.keys(attrs).sort(), [attrs]);
  const total = allKeys.length;

  const filteredKeys = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allKeys;
    return allKeys.filter(
      (k) =>
        k.toLowerCase().includes(q) ||
        (attrs[k] ?? "").toLowerCase().includes(q),
    );
  }, [allKeys, attrs, search]);

  if (total === 0) {
    return <p className="text-xs text-muted-foreground">(none)</p>;
  }

  return (
    <div className="space-y-3">
      {enableToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter attributes…"
            className="h-8 max-w-xs text-xs"
          />
          <div className="inline-flex rounded-md border bg-muted p-0.5 text-xs">
            <button
              type="button"
              className={cn(
                "rounded px-2 py-0.5",
                view === "grouped"
                  ? "bg-background shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setView("grouped")}
            >
              Grouped
            </button>
            <button
              type="button"
              className={cn(
                "rounded px-2 py-0.5",
                view === "flat"
                  ? "bg-background shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setView("flat")}
            >
              Flat
            </button>
          </div>
          <Badge variant="outline" className="text-[11px]">
            Showing {filteredKeys.length} of {total}
          </Badge>
        </div>
      )}

      {view === "flat" ? (
        <dl>
          {filteredKeys.map((k) => (
            <AttrRow
              key={k}
              attrKey={k}
              value={attrs[k] ?? ""}
              reveal={reveal}
              scrubSensitive={scrubSensitive}
            />
          ))}
        </dl>
      ) : (
        <GroupedAttrs
          keys={filteredKeys}
          attrs={attrs}
          reveal={reveal}
          scrubSensitive={scrubSensitive}
        />
      )}
    </div>
  );
}

function GroupedAttrs({
  keys,
  attrs,
  reveal,
  scrubSensitive,
}: {
  keys: string[];
  attrs: Record<string, string>;
  reveal: boolean;
  scrubSensitive: boolean;
}) {
  // Bucket by prefix, preserving sorted order.
  const groups = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const k of keys) {
      const p = prefixOf(k);
      const list = map.get(p);
      if (list) list.push(k);
      else map.set(p, [k]);
    }
    // Stable sort by friendly label.
    return Array.from(map.entries()).sort(([a], [b]) =>
      labelFor(a).localeCompare(labelFor(b)),
    );
  }, [keys]);

  if (groups.length === 0) {
    return <p className="text-xs text-muted-foreground">(no matches)</p>;
  }

  return (
    <div className="space-y-2">
      {groups.map(([prefix, ks]) => (
        <details
          key={prefix}
          open={DEFAULT_OPEN_PREFIXES.has(prefix)}
          className="rounded border bg-card"
        >
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium hover:bg-accent">
            {labelFor(prefix)}{" "}
            <span className="ml-1 text-muted-foreground">({ks.length})</span>
          </summary>
          <dl className="px-3 pb-2">
            {ks.map((k) => (
              <AttrRow
                key={k}
                attrKey={k}
                value={attrs[k] ?? ""}
                reveal={reveal}
                scrubSensitive={scrubSensitive}
              />
            ))}
          </dl>
        </details>
      ))}
    </div>
  );
}

export function SpanDetailDialog({
  span,
  onOpenChange,
}: {
  span: SpanRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const reveal = useRevealFlag();
  const { tz } = useTimezone();
  const open = span !== null;
  if (!span) return null;

  const scrubbed = {
    span_id: span.span_id,
    parent_span_id: span.parent_span_id,
    trace_id: span.trace_id,
    span_name: span.span_name,
    service_name: span.service_name,
    span_kind: span.span_kind,
    started_at_ns: span.started_at_ns,
    duration_ns: span.duration_ns,
    status_code: span.status_code,
    status_message: span.status_message,
    attributes: scrub(span.attributes, reveal),
    resource: span.resource,
    events: span.events.map((e) => ({
      ts: e.ts,
      name: e.name,
      attrs: scrub(e.attrs, reveal),
    })),
  };
  const rawText = JSON.stringify(scrubbed, null, 2);
  const startedIso = nsToIso(span.started_at_ns);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-label={`Span details: ${span.span_name}`}>
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <DialogTitle className="truncate font-mono text-xl">
                {span.span_name}
              </DialogTitle>
              <StatusBadge
                code={span.status_code}
                message={span.status_message}
              />
              <DurationPill ns={span.duration_ns} />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!reveal && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => setRevealActive(true)}
                >
                  Reveal sensitive
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close span details"
                data-autofocus
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{span.service_name}</span>
            <span>·</span>
            <span>{span.span_kind}</span>
            {startedIso && (
              <>
                <span>·</span>
                <span>{formatTimestampInTz(startedIso, tz)}</span>
              </>
            )}
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <span className="font-mono">span_id: {span.span_id}</span>
              <CopyButton
                value={span.span_id}
                label="Copy span id"
                className="h-5 w-5"
              />
            </span>
            {span.parent_span_id && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <span className="font-mono">
                    parent: {span.parent_span_id}
                  </span>
                  <CopyButton
                    value={span.parent_span_id}
                    label="Copy parent span id"
                    className="h-5 w-5"
                  />
                </span>
              </>
            )}
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <RevealBanner />
          <Tabs
            defaultValue="attributes"
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="sticky top-0 z-10 mx-5 mt-3 self-start border bg-card">
              <TabsTrigger value="attributes">Attributes</TabsTrigger>
              <TabsTrigger value="resource">Resource</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="raw">Raw JSON</TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              <TabsContent value="attributes" className="mt-0">
                <AttrSection
                  attrs={span.attributes}
                  reveal={reveal}
                  scrubSensitive
                />
              </TabsContent>
              <TabsContent value="resource" className="mt-0">
                <AttrSection
                  attrs={span.resource}
                  reveal={reveal}
                  scrubSensitive={false}
                />
              </TabsContent>
              <TabsContent value="events" className="mt-0">
                {span.events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">(none)</p>
                ) : (
                  <div className="space-y-3">
                    {span.events.map((e, i) => (
                      <article key={i} className="rounded border bg-card p-3">
                        <header className="mb-2 flex items-center justify-between text-xs">
                          <span className="font-mono font-medium">
                            {e.name}
                          </span>
                          <span className="text-muted-foreground">
                            {formatTimestampInTz(e.ts, tz)}
                          </span>
                        </header>
                        <AttrSection
                          attrs={e.attrs}
                          reveal={reveal}
                          scrubSensitive
                          enableToolbar={false}
                        />
                      </article>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="raw" className="mt-0">
                <div className="relative">
                  <CopyButton
                    value={rawText}
                    label="Copy all JSON"
                    className="absolute right-2 top-2"
                  />
                  <pre className="overflow-auto whitespace-pre rounded border bg-muted/30 p-3 font-mono text-xs">
                    {rawText}
                  </pre>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
