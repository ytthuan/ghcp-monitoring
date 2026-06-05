import { formatNumber, formatMs, formatUsd, formatPct } from "~/lib/format";

export function FormatCell({
  kind,
  value,
}: {
  kind: "number" | "ms" | "usd" | "pct" | "string";
  value: number | string | null | undefined;
}) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  switch (kind) {
    case "number":
      return <span className="tabular-nums">{formatNumber(Number(value))}</span>;
    case "ms":
      return <span className="tabular-nums">{formatMs(Number(value))}</span>;
    case "usd":
      return <span className="tabular-nums">{formatUsd(Number(value))}</span>;
    case "pct":
      return <span className="tabular-nums">{formatPct(Number(value))}</span>;
    case "string":
    default:
      return <span className="truncate">{String(value)}</span>;
  }
}
