/**
 * Telemetry-safe CSV export for the traces list.
 *
 * Export ONLY the columns visible in the traces table — never raw span
 * attributes, prompt/response text, or tool args/results. The `trace_id`
 * is included so a downloaded CSV remains useful for follow-up.
 */
import type { TraceRow } from "~/server/queries/traces";

const COLUMNS = [
  "started_at",
  "root_name",
  "root_service",
  "duration_ms",
  "span_count",
  "errors",
  "input",
  "output",
  "trace_id",
] as const;

function durationMsFromNs(ns: string): number {
  try {
    return Number(BigInt(ns) / 1_000_000n);
  } catch {
    return 0;
  }
}

function escape(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildTracesCsv(rows: TraceRow[]): string {
  const header = COLUMNS.join(",");
  const body = rows
    .map((r) =>
      [
        r.started_at,
        r.root_name,
        r.root_service,
        durationMsFromNs(r.duration_ns),
        r.span_count,
        r.errors,
        r.input,
        r.output,
        r.trace_id,
      ]
        .map(escape)
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}\n`;
}

export function tracesCsvFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());
  return `traces-${yyyy}-${mm}-${dd}-${hh}${mi}.csv`;
}

export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
