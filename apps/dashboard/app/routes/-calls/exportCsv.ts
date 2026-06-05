import type { CallRow } from "~/lib/types";

/**
 * CSV export for the Calls table.
 *
 * SAFETY (must not regress):
 *   - We hard-allowlist the column IDs that may be exported. The `content`
 *     column (RevealableCell — input/output messages) is NEVER allowed,
 *     even if it appears in `visibleIds`. The export source is the typed
 *     `CallRow` shape only — we never touch revealed content state.
 *   - Cells are CSV-escaped (RFC 4180): values containing comma, quote,
 *     newline, or CR are wrapped in double quotes with internal quotes
 *     doubled. This is purely a formatting concern and cannot leak data.
 */
const ALLOWED_EXPORT_COLUMNS = new Set<string>([
  "timestamp",
  "request_model",
  "response_model",
  "input",
  "output",
  "cache_read",
  "cache_create",
  "duration_ms",
  "finish_reasons",
  "agent_name",
  "conversation_id",
  "trace_id",
  "span_id",
  "est_cost",
  "credits",
]);

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function cellValue(
  row: CallRow,
  id: string,
  estCostUsd: number | null,
): string {
  switch (id) {
    case "timestamp":
      return row.timestamp;
    case "request_model":
      return row.request_model;
    case "response_model":
      return row.response_model;
    case "input":
      return String(row.input);
    case "output":
      return String(row.output);
    case "cache_read":
      return String(row.cache_read);
    case "cache_create":
      return String(row.cache_create);
    case "duration_ms":
      return String(row.duration_ms);
    case "finish_reasons":
      return row.finish_reasons;
    case "agent_name":
      return row.agent_name;
    case "conversation_id":
      return row.conversation_id;
    case "trace_id":
      return row.trace_id;
    case "span_id":
      return row.span_id;
    case "est_cost":
      return estCostUsd == null ? "" : estCostUsd.toFixed(6);
    case "credits":
      return String(row.copilot_cost);
    default:
      // Unknown / non-data column (e.g. view_trace, content) — emit blank.
      return "";
  }
}

export function buildCallsCsv(opts: {
  rows: CallRow[];
  visibleIds: readonly string[];
  estCost?: (row: CallRow) => number | null;
}): string {
  const { rows, visibleIds, estCost } = opts;
  const cols = visibleIds.filter((id) => ALLOWED_EXPORT_COLUMNS.has(id));
  if (cols.length === 0) return "";
  const header = cols.map(csvEscape).join(",");
  const lines = rows.map((r) => {
    const cost = estCost ? estCost(r) : null;
    return cols.map((id) => csvEscape(cellValue(r, id, cost))).join(",");
  });
  return [header, ...lines].join("\n");
}

export function csvFilename(now: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  return `calls-${y}-${m}-${d}-${hh}${mm}.csv`;
}

export function downloadCsv(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so Playwright/browsers can finish reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
