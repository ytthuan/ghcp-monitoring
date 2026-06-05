/**
 * Tiny client-side CSV exporter. Defends against accidentally writing
 * sensitive prompt/response/tool-arg/tool-result fields by skipping any
 * cell that looks redacted or contains those substrings.
 *
 * Allowlist note: numeric breakdown columns emitted by the /models export —
 * `cost_input`, `cost_output`, `cost_cache_read`, `cost_cache_create` — are
 * pure numbers (USD floats) with no message/tool content; they bypass the
 * SENSITIVE_RE scrub by virtue of being typed `number` (see `safeCell`).
 * Do NOT widen SENSITIVE_RE for these columns.
 */
const SENSITIVE_RE = /(^|\b)(prompt:|response:|tool_args|tool_result|gen_ai\.tool\.call\.(arguments|result)|input_messages|output_messages)/i;

function safeCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const s = String(v);
  if (s === "[redacted]") return "";
  if (SENSITIVE_RE.test(s)) return "";
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
): void {
  if (typeof window === "undefined") return;
  const head = headers.map(safeCell).join(",");
  const body = rows.map((r) => r.map(safeCell).join(",")).join("\n");
  const csv = `${head}\n${body}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke to allow Safari to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
