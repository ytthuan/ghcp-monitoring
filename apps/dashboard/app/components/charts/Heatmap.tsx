"use client";
import { Link } from "@tanstack/react-router";
import type { HeatCell } from "~/lib/types";
import { formatExact, formatTokens } from "~/lib/format";
import { resolveQueryTz, timezoneLabel } from "~/lib/use-timezone";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DOW_LABELS_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

interface HeatBucket {
  input: number;
  output: number;
  total: number;
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function padHour(hour: number): string {
  return hour.toString().padStart(2, "0");
}

function hourRangeLabel(hour: number): string {
  return `${padHour(hour)}:00-${padHour((hour + 1) % 24)}:00`;
}

function wallPartsInTz(date: Date, tz: string): WallParts {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts["year"]),
    month: Number(parts["month"]),
    day: Number(parts["day"]),
    hour: Number(parts["hour"]),
    minute: Number(parts["minute"]),
    second: Number(parts["second"]),
  };
}

function wallMs(p: WallParts): number {
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

function dowFromYmd(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

function shiftYmd(
  year: number,
  month: number,
  day: number,
  deltaDays: number,
): Pick<WallParts, "year" | "month" | "day"> {
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function zonedWallTimeToUtc(
  tz: string,
  desired: WallParts,
): Date | null {
  let candidate = new Date(wallMs(desired));
  for (let i = 0; i < 4; i += 1) {
    const actual = wallPartsInTz(candidate, tz);
    const delta = wallMs(desired) - wallMs(actual);
    if (delta === 0) return candidate;
    candidate = new Date(candidate.getTime() + delta);
  }
  return wallMs(wallPartsInTz(candidate, tz)) === wallMs(desired)
    ? candidate
    : null;
}

/**
 * Build a precise (from, to) ISO range that points at the most recent
 * occurrence of the active-timezone (dow, hour) bucket the user clicked.
 * The heatmap aggregates over the active filter window, so "the hour you
 * clicked" means "the most recent matching local wall-clock hour bucket".
 */
function mostRecentHourWindowInTz(dow: number, hour: number, tz: string): {
  from: string;
  to: string;
} {
  const now = new Date();
  const nowLocal = wallPartsInTz(now, tz);
  const todayDow = dowFromYmd(nowLocal.year, nowLocal.month, nowLocal.day);
  let deltaDays = (todayDow - dow + 7) % 7;
  if (deltaDays === 0 && hour > nowLocal.hour) deltaDays = 7;

  for (let weekOffset = 0; weekOffset < 53; weekOffset += 1) {
    const ymd = shiftYmd(
      nowLocal.year,
      nowLocal.month,
      nowLocal.day,
      -(deltaDays + weekOffset * 7),
    );
    const from = zonedWallTimeToUtc(tz, {
      ...ymd,
      hour,
      minute: 0,
      second: 0,
    });
    if (from && from.getTime() <= now.getTime()) {
      const to = new Date(from.getTime() + 60 * 60 * 1000);
      return { from: from.toISOString(), to: to.toISOString() };
    }
  }

  throw new RangeError(
    `Could not resolve heatmap bucket ${DOW_LABELS[dow] ?? dow} ${hour}:00 in ${tz}`,
  );
}

/**
 * Day-of-week × hour-of-day heatmap. Color-encoded by total token volume
 * (log-scaled so a few outliers don't flatten the rest), with a compact
 * label rendered in each cell so the chart works without relying on color
 * (WCAG-AA). Click a cell to open a popover with the exact breakdown and
 * a drill-down to /calls for the matching hour window.
 *
 * Buckets are pre-aggregated server-side in the same timezone shown in the
 * caption. The UI therefore treats day/hour as active-timezone buckets.
 */
export function Heatmap({
  data,
  tz: tzProp = "UTC",
}: {
  data: HeatCell[];
  tz?: string;
}) {
  const activeTz = resolveQueryTz(tzProp);
  const activeTzLabel = tzProp === "local" ? timezoneLabel(tzProp) : activeTz;

  const grid: HeatBucket[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ input: 0, output: 0, total: 0 })),
  );
  let max = 0;
  for (const c of data) {
    // ClickHouse DOW is 1..7 (Mon=1); convert to 0-indexed Mon=0.
    const dow = (c.dow + 6) % 7;
    if (dow < 0 || dow > 6 || c.hour < 0 || c.hour > 23) continue;
    const row = grid[dow];
    const bucket = row?.[c.hour];
    if (!bucket) continue;
    bucket.input = c.input;
    bucket.output = c.output;
    bucket.total = c.input + c.output;
    if (bucket.total > max) max = bucket.total;
  }

  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-[10px] text-muted-foreground">
        Hour bucket: {activeTzLabel}.
      </p>
      <table className="border-separate border-spacing-1 text-[10px]">
        <thead aria-label={`Hour of day in ${activeTzLabel}`}>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => (
              <th
                key={h}
                className="font-mono text-muted-foreground"
                title={`${padHour(h)}:00 in ${activeTzLabel}`}
              >
                {padHour(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, di) => (
            <tr key={di}>
              <td className="pr-1 text-right font-mono text-muted-foreground">
                {DOW_LABELS[di]}
              </td>
              {row.map((bucket, h) => {
                if (bucket.total === 0) {
                  return <td key={h} className="h-9 w-12" />;
                }
                const ratio =
                  max > 0
                    ? Math.log1p(bucket.total) / Math.log1p(max)
                    : 0;
                const bg = `hsl(var(--chart-1) / ${0.12 + ratio * 0.78})`;
                const hourLabel = `${padHour(h)}:00`;
                const dayShort = DOW_LABELS[di] ?? "—";
                const dayLong = DOW_LABELS_LONG[di] ?? "—";
                const titleStr = `${dayShort} ${hourLabel} ${activeTzLabel} — ${formatExact(bucket.total)} tokens`;
                const ariaStr = `${dayShort} ${hourLabel} ${activeTzLabel}, ${formatExact(bucket.input)} input plus ${formatExact(bucket.output)} output equals ${formatExact(bucket.total)} tokens`;
                const window = mostRecentHourWindowInTz(di, h, activeTz);
                return (
                  <td key={h} className="p-0">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          data-testid="heatmap-cell"
                          className="block h-9 w-12 rounded text-center align-middle text-[10px] tabular-nums hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{ background: bg }}
                          title={titleStr}
                          aria-label={ariaStr}
                        >
                          {formatTokens(bucket.total)}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="center"
                        className="w-64 space-y-2 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-medium text-foreground">
                            {dayLong} · {hourRangeLabel(h)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Bucket shown in {activeTzLabel}
                          </div>
                        </div>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular-nums">
                          <dt className="text-muted-foreground">Total</dt>
                          <dd className="text-right font-medium text-foreground">
                            {formatExact(bucket.total)}
                          </dd>
                          <dt className="text-muted-foreground">Input</dt>
                          <dd className="text-right text-foreground">
                            {formatExact(bucket.input)}
                          </dd>
                          <dt className="text-muted-foreground">Output</dt>
                          <dd className="text-right text-foreground">
                            {formatExact(bucket.output)}
                          </dd>
                        </dl>
                        <div className="pt-1">
                          <Link
                            to="/calls"
                            search={(prev: Record<string, unknown>) => ({
                              ...prev,
                              range: "custom" as const,
                              from: window.from,
                              to: window.to,
                            })}
                            data-testid="heatmap-popover-drilldown"
                            className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            Open /calls for this hour →
                          </Link>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
