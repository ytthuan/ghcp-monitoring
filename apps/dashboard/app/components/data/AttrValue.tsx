"use client";
/**
 * Smart renderer for OTel attribute / event values. All values come in as
 * strings (CH Map values are stringified). Decision tree:
 *   1) sensitive + !reveal  → <RedactedValue/> with per-cell Reveal button
 *   2) JSON-shaped          → collapsible block (JSON.parse succeeded AND
 *                             object/array AND len > 40)
 *   3) string > 200 chars   → collapsed preview with Expand + wrap toggle
 *   4) plain                → monospace span with normal wrap
 *
 * The Reveal button mutates the GLOBAL session reveal flag (same source as
 * <RevealBanner/>) — this is intentional. Once revealed, the banner shows
 * the operator they're now in reveal mode.
 */
import * as React from "react";
import { Check, ChevronRight, Copy, Eye } from "lucide-react";
import { cn } from "~/lib/utils";
import { setRevealActive } from "~/components/layout/RevealBanner";

export const SENSITIVE_ATTR_KEYS = new Set<string>([
  "gen_ai.input.messages",
  "gen_ai.output.messages",
  "gen_ai.system_instructions",
  "gen_ai.tool.call.arguments",
  "gen_ai.tool.call.result",
  "gen_ai.tool.definitions",
]);

/**
 * Prefix-based sensitivity check covering current OTel GenAI conventions
 * AND legacy/alt-shape names. Use isSensitiveAttr(key) instead of
 * .has(key) to catch:
 *   - gen_ai.prompt.0.content    (legacy prompt array)
 *   - gen_ai.completion.0.content (legacy completion array)
 *   - gen_ai.input.messages       (current — already in exact set)
 *   - gen_ai.output.messages      (current — already in exact set)
 *   - gen_ai.tool.call.arguments  (current — already in exact set)
 *   - gen_ai.tool.call.result     (current — already in exact set)
 *   - input_messages / output_messages / messages / content / arguments / result
 *     (bare keys some exporters emit)
 */
export const SENSITIVE_ATTR_PREFIX_RE =
  /^gen_ai\.(prompt|completion|input|output|tool)\./;

export const SENSITIVE_ATTR_BARE_KEYS = new Set<string>([
  "messages",
  "content",
  "arguments",
  "result",
  "input_messages",
  "output_messages",
]);

export function isSensitiveAttr(key: string): boolean {
  if (SENSITIVE_ATTR_KEYS.has(key)) return true;
  if (SENSITIVE_ATTR_PREFIX_RE.test(key)) return true;
  if (SENSITIVE_ATTR_BARE_KEYS.has(key)) return true;
  return false;
}

interface AttrValueProps {
  attrKey: string;
  value: string;
  reveal: boolean;
  scrubSensitive: boolean;
}

export function AttrValue({
  attrKey,
  value,
  reveal,
  scrubSensitive,
}: AttrValueProps) {
  const isSensitive = scrubSensitive && isSensitiveAttr(attrKey);
  if (isSensitive && !reveal) return <RedactedValue />;

  const parsed = tryParseJson(value);
  if (
    parsed.ok &&
    (Array.isArray(parsed.value) ||
      (typeof parsed.value === "object" && parsed.value !== null)) &&
    value.length > 40
  ) {
    return <JsonValue data={parsed.value} />;
  }
  if (value.length > 200) return <LongStringValue value={value} />;
  return <PlainValue value={value} />;
}

function tryParseJson(
  s: string,
): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
}

function RedactedValue() {
  return (
    <div className="flex items-center gap-2">
      <span className="italic text-muted-foreground">[redacted]</span>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => setRevealActive(true)}
      >
        <Eye className="h-3 w-3" />
        Reveal
      </button>
    </div>
  );
}

function PlainValue({ value }: { value: string }) {
  return <span className="break-words font-mono text-xs">{value}</span>;
}

function LongStringValue({ value }: { value: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const [wrap, setWrap] = React.useState(true);
  const preview = value.length > 200 ? value.slice(0, 200) + "…" : value;
  return (
    <div className="space-y-1">
      <pre
        className={cn(
          "max-h-96 overflow-auto rounded border bg-muted/30 p-2 font-mono text-xs",
          wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
        )}
      >
        {expanded ? value : preview}
      </pre>
      <div className="flex gap-2">
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Collapse" : `Expand (${value.length} chars)`}
        </button>
        {expanded && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            onClick={() => setWrap((v) => !v)}
          >
            {wrap ? "No-wrap" : "Wrap"}
          </button>
        )}
      </div>
    </div>
  );
}

function JsonValue({ data }: { data: unknown }) {
  const [expanded, setExpanded] = React.useState(true);
  const [wrap, setWrap] = React.useState(true);
  const text = React.useMemo(() => JSON.stringify(data, null, 2), [data]);
  const summary = Array.isArray(data)
    ? `[…] (${data.length} items, ${text.length} chars)`
    : `{…} (${Object.keys(data as object).length} keys, ${text.length} chars)`;
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 transition-transform",
            expanded && "rotate-90",
          )}
        />
        {expanded ? "JSON" : summary}
      </button>
      {expanded && (
        <>
          <pre
            className={cn(
              "max-h-[28rem] overflow-auto rounded border bg-muted/30 p-2 font-mono text-xs",
              wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
            )}
          >
            {text}
          </pre>
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            onClick={() => setWrap((v) => !v)}
          >
            {wrap ? "No-wrap" : "Wrap"}
          </button>
        </>
      )}
    </div>
  );
}

/** Reusable copy-to-clipboard button with success-check feedback. */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [ok, setOk] = React.useState(false);
  return (
    <button
      type="button"
      aria-label={label ?? "Copy to clipboard"}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
      onClick={() => {
        if (typeof navigator === "undefined") return;
        void navigator.clipboard?.writeText(value).catch(() => {
          /* ignore clipboard errors */
        });
        setOk(true);
        window.setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? (
        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
