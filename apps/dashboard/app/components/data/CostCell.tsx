"use client";
/**
 * Click-to-open cost-breakdown popover. Replaces the title-only
 * `<span title="priced as ...">$X.YZ</span>` cells across /calls, /, and
 * /models with a touch-friendly + keyboard-accessible breakdown of the
 * 4 token components (fresh input / output / cache_read / cache_create) and the
 * model the row was priced against.
 */
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { estimateCostBreakdown, internalModelInfo } from "~/server/pricing";
import { FormatCell } from "./FormatCell";
import { formatUsd, formatUsdExact } from "~/lib/format";
import { InternalModelBadge } from "./InternalModelBadge";

interface CostCellProps {
  requestModel: string | null | undefined;
  responseModel: string | null | undefined;
  input: number;
  output: number;
  cache_read: number;
  cache_create: number;
}

export function CostCell(props: CostCellProps) {
  const v = estimateCostBreakdown(props);
  if (v == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const rows: ReadonlyArray<{
    key: keyof typeof v.breakdown;
    label: string;
    tokens: number;
  }> = [
    { key: "input", label: "fresh_input", tokens: v.tokenBreakdown.input },
    { key: "output", label: "output", tokens: v.tokenBreakdown.output },
    { key: "cache_read", label: "cache_read", tokens: v.tokenBreakdown.cache_read },
    { key: "cache_create", label: "cache_create", tokens: v.tokenBreakdown.cache_create },
  ];
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Cost breakdown: ${formatUsd(v.cost)}, click for details`}
        title={formatUsdExact(v.cost)}
        className="cursor-pointer tabular-nums underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        <FormatCell kind="usd" value={v.cost} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-2 text-xs">
          <div className="font-medium">Cost breakdown</div>
          <table className="w-full">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="font-normal pb-1">component</th>
                <th className="font-normal pb-1 text-right">tokens</th>
                <th className="font-normal pb-1 text-right">cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="py-1 font-mono">{r.label}</td>
                  <td className="py-1 text-right tabular-nums">
                    <FormatCell kind="number" value={r.tokens} />
                  </td>
                  <td
                    className="py-1 text-right tabular-nums"
                    title={formatUsdExact(v.breakdown[r.key])}
                  >
                    <FormatCell kind="usd" value={v.breakdown[r.key]} />
                  </td>
                </tr>
              ))}
              <tr className="border-t font-medium">
                <td className="py-1">total</td>
                <td />
                <td
                  className="py-1 text-right tabular-nums"
                  title={formatUsdExact(v.cost)}
                >
                  <FormatCell kind="usd" value={v.cost} />
                </td>
              </tr>
            </tbody>
          </table>
          <p className="pt-1 text-[11px] leading-snug text-muted-foreground">
            priced as <span className="font-mono">{v.pricedAs}</span>
            <InternalModelBadge model={v.pricedAs} variant="inline" /> ·{" "}
            {internalModelInfo(v.pricedAs) ? (
              <>(included in subscription — no per-token rate)</>
            ) : (
              <>
                ${v.rate.input.toFixed(2)}/MTok in · $
                {v.rate.output.toFixed(2)}/MTok out
              </>
            )}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
