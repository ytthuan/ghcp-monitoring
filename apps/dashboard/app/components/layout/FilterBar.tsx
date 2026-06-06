"use client";
import * as React from "react";
import { Calendar, ChevronDown, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { useFilters } from "~/lib/use-filters";
import type { Filters, TimeRange, Granularity } from "~/lib/types";
import { useTimezone, resolveTz } from "~/lib/use-timezone";
import { cn } from "~/lib/utils";

const GRANS: Granularity[] = ["5m", "1h", "1d"];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

// ---------------------------------------------------------------------------
// Range presets
// ---------------------------------------------------------------------------
//
// Presets either map to an existing TimeRange enum value (1h/6h/24h/7d/30d)
// or set range="custom" with concrete from/to bounds. We deliberately do NOT
// extend the TimeRange enum because the ClickHouse server filters in
// `app/server/filters.ts` only know the original 6 values and Wave 2 may not
// touch server code.
//
// `Custom…` is a special case — it does not change filters, just opens the
// date inputs.

export type RangePresetId =
  | "today"
  | "yesterday"
  | "24h"
  | "7d"
  | "30d"
  | "mtd"
  | "custom";

export interface RangePreset {
  id: RangePresetId;
  label: string;
  /** undefined = pure UI affordance (do not touch filters). */
  toFilters?: (now: Date, tz: string) => Partial<Filters>;
}

/** UTC-offset (in minutes) of `tz` at the given instant. */
function tzOffsetMinutes(tz: string, atUtc: Date): number {
  const resolved = resolveTz(tz);
  // Intl.DateTimeFormat in `en-CA` gives ISO-ish y/m/d/h/m/s parts which we
  // can re-stringify deterministically.
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolved,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(atUtc).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"]) === 24 ? 0 : Number(parts["hour"]),
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return Math.round((asUtc - atUtc.getTime()) / 60_000);
}

function startOfDayInTz(tz: string, now: Date): Date {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveTz(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ymd = dtf.format(now); // "YYYY-MM-DD"
  const guess = new Date(`${ymd}T00:00:00Z`);
  const offMin = tzOffsetMinutes(tz, guess);
  return new Date(guess.getTime() - offMin * 60_000);
}

function startOfMonthInTz(tz: string, now: Date): Date {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveTz(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(now).map((p) => [p.type, p.value]),
  );
  const ymd = `${parts["year"]}-${parts["month"]}-01`;
  const guess = new Date(`${ymd}T00:00:00Z`);
  const offMin = tzOffsetMinutes(tz, guess);
  return new Date(guess.getTime() - offMin * 60_000);
}

function isoUtc(d: Date): string {
  // Strip fractional seconds for a tidy URL: YYYY-MM-DDTHH:mm:ssZ
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function partsInTz(value: string | Date, tz: string): Record<string, string> {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return {};
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveTz(tz),
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
}

function datetimeLocalValue(iso: string | undefined, tz: string): string {
  if (!iso) return "";
  const parts = partsInTz(iso, tz);
  if (!parts["year"] || !parts["month"] || !parts["day"]) return "";
  const hour = parts["hour"] === "24" ? "00" : parts["hour"];
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}T${hour}:${parts["minute"]}`;
}

function datetimeLocalToIso(value: string, tz: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const wallClockAsUtc = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
  const offMin = tzOffsetMinutes(tz, wallClockAsUtc);
  return isoUtc(new Date(wallClockAsUtc.getTime() - offMin * 60_000));
}

export const RANGE_PRESETS: RangePreset[] = [
  {
    id: "today",
    label: "Today",
    toFilters: (now, tz) => ({
      range: "custom",
      from: isoUtc(startOfDayInTz(tz, now)),
      to: isoUtc(now),
    }),
  },
  {
    id: "yesterday",
    label: "Yesterday",
    toFilters: (now, tz) => {
      const todayStart = startOfDayInTz(tz, now);
      const yesterdayStart = new Date(todayStart.getTime() - 24 * 3600_000);
      return {
        range: "custom",
        from: isoUtc(yesterdayStart),
        to: isoUtc(todayStart),
      };
    },
  },
  {
    id: "24h",
    label: "Last 24h",
    toFilters: () => ({ range: "24h", from: undefined, to: undefined }),
  },
  {
    id: "7d",
    label: "Last 7d",
    toFilters: () => ({ range: "7d", from: undefined, to: undefined }),
  },
  {
    id: "30d",
    label: "Last 30d",
    toFilters: () => ({ range: "30d", from: undefined, to: undefined }),
  },
  {
    id: "mtd",
    label: "This month",
    toFilters: (now, tz) => ({
      range: "custom",
      from: isoUtc(startOfMonthInTz(tz, now)),
      to: isoUtc(now),
    }),
  },
  { id: "custom", label: "Custom…" },
];

/** Apply a preset to the URL filter state. */
export function applyRangePreset(
  preset: RangePreset,
  setFilters: (next: Partial<Filters>) => void,
  tz: string = "UTC",
): void {
  if (!preset.toFilters) return;
  setFilters(preset.toFilters(new Date(), tz));
}

/** Human label for the currently selected range. */
export function formatRangeLabel(filters: Filters, tz: string = "UTC"): string {
  switch (filters.range) {
    case "1h":
      return "Last 1h";
    case "6h":
      return "Last 6h";
    case "24h":
      return "Last 24h";
    case "7d":
      return "Last 7d";
    case "30d":
      return "Last 30d";
    case "custom": {
      if (filters.from && filters.to) {
        return `Custom: ${datetimeLocalValue(filters.from, tz)} → ${datetimeLocalValue(filters.to, tz)}`;
      }
      return "Custom range";
    }
    default:
      return "Range";
  }
}

// ---------------------------------------------------------------------------
// Debounced text input (for models / agents)
// ---------------------------------------------------------------------------

function DebouncedListInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = React.useState(value.join(","));
  // Sync external changes (e.g. chip ✕ click) into the input.
  const lastExternal = React.useRef(value.join(","));
  React.useEffect(() => {
    const incoming = value.join(",");
    if (incoming !== lastExternal.current) {
      lastExternal.current = incoming;
      setDraft(incoming);
    }
  }, [value]);

  // Debounce 250 ms.
  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      const parsed = draft
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const same =
        parsed.length === value.length &&
        parsed.every((v, i) => v === value[i]);
      if (!same) {
        lastExternal.current = parsed.join(",");
        onChange(parsed);
      }
    }, 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <div className="relative">
      <Input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-8 w-56 pr-8"
      />
      {draft.length > 0 ? (
        <button
          type="button"
          aria-label={`Clear ${ariaLabel}`}
          onClick={() => {
            setDraft("");
            lastExternal.current = "";
            onChange([]);
          }}
          className={cn(
            "absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            FOCUS_RING,
          )}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active-filter chip
// ---------------------------------------------------------------------------

function FilterChip({
  label,
  onClear,
  testId,
}: {
  label: string;
  onClear: () => void;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className="anim-pop inline-flex items-center gap-1 rounded-sm border bg-muted px-2 py-0.5 text-xs text-foreground"
    >
      <span className="truncate max-w-[16rem]">{label}</span>
      <button
        type="button"
        aria-label={`Clear ${label}`}
        onClick={onClear}
        className={cn(
          "inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          FOCUS_RING,
        )}
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// FilterBar
// ---------------------------------------------------------------------------

export function FilterBar() {
  const { filters, setFilters } = useFilters();
  const { tz } = useTimezone();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [rangeOpen, setRangeOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const [showCustomInputs, setShowCustomInputs] = React.useState(
    filters.range === "custom",
  );
  React.useEffect(() => {
    const el = rootRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const writeHeight = () => {
      parent.style.setProperty("--ghcp-filter-bar-height", `${el.offsetHeight}px`);
    };
    writeHeight();
    const observer = new ResizeObserver(writeHeight);
    observer.observe(el);
    window.addEventListener("resize", writeHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", writeHeight);
      parent.style.removeProperty("--ghcp-filter-bar-height");
    };
  }, []);
  React.useEffect(() => {
    if (filters.range === "custom") setShowCustomInputs(true);
  }, [filters.range]);

  const onPickPreset = (p: RangePreset) => {
    if (p.id === "custom") {
      setShowCustomInputs(true);
      // Keep current filter values; the user will edit datetime-local inputs.
      // But ensure range is "custom" so the inputs apply.
      if (filters.range !== "custom") setFilters({ range: "custom" });
    } else {
      applyRangePreset(p, setFilters, tz);
      // Hide the datetime inputs when a non-custom preset is chosen.
      if (p.toFilters) {
        const next = p.toFilters(new Date(), tz);
        setShowCustomInputs(next.range === "custom");
      }
    }
    setRangeOpen(false);
  };

  const rangeLabel = formatRangeLabel(filters, tz);

  // Build chip list. We include a range chip when range !== "7d" (the
  // dashboard's typical default). This is a pragmatic choice — comparing to
  // the env-injected default would require threading config here; instead
  // we surface every non-7d range so the user always sees what's active.
  const chips: React.ReactNode[] = [];
  if (filters.range !== "7d") {
    chips.push(
      <FilterChip
        key="range"
        testId="filter-chip-range"
        label={rangeLabel}
        onClear={() => {
          setFilters({ range: "7d", from: undefined, to: undefined });
          setShowCustomInputs(false);
        }}
      />,
    );
  }
  for (const m of filters.models) {
    chips.push(
      <FilterChip
        key={`model:${m}`}
        testId={`filter-chip-model-${m}`}
        label={`model: ${m}`}
        onClear={() =>
          setFilters({ models: filters.models.filter((x) => x !== m) })
        }
      />,
    );
  }
  for (const a of filters.agents) {
    chips.push(
      <FilterChip
        key={`agent:${a}`}
        testId={`filter-chip-agent-${a}`}
        label={`agent: ${a}`}
        onClear={() =>
          setFilters({ agents: filters.agents.filter((x) => x !== a) })
        }
      />,
    );
  }

  return (
    <div
      ref={rootRef}
      data-testid="filter-bar"
      className="sticky top-0 z-20 border-b bg-background/95 px-2 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-4"
    >
      {/* Mobile toggle button -- visible only below md */}
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        className="mb-1 flex w-full items-center gap-2 text-sm font-medium text-foreground md:hidden"
        aria-expanded={mobileOpen}
        aria-label="Toggle filters"
        data-testid="filter-mobile-toggle"
      >
        <span>Filters</span>
        {(filters.range !== "7d" || filters.models.length > 0 || filters.agents.length > 0) && (
          <span
            data-testid="filter-active-count"
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground"
          >
            {[filters.range !== "7d" ? 1 : 0, filters.models.length, filters.agents.length].reduce((a, b) => a + b, 0)}
          </span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200",
            mobileOpen && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {/* Collapsible content wrapper -- always expanded on md+, toggled on mobile */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          mobileOpen
            ? "max-h-[1000px] opacity-100"
            : "max-h-0 opacity-0 md:max-h-[1000px] md:opacity-100",
        )}
      >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Range</span>
          <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Range: ${rangeLabel}`}
                data-testid="range-trigger"
                className={cn("h-8 gap-2 px-2", FOCUS_RING)}
              >
                <Calendar className="h-3.5 w-3.5" aria-hidden />
                <span className="max-w-[14rem] truncate">{rangeLabel}</span>
                <ChevronDown
                  className="h-3.5 w-3.5 opacity-60"
                  aria-hidden
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-56 p-1"
              data-testid="range-popover"
            >
              <ul className="space-y-0.5" role="listbox" aria-label="Range presets">
                {RANGE_PRESETS.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      data-testid={`range-preset-${p.id}`}
                      onClick={() => onPickPreset(p)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                        FOCUS_RING,
                      )}
                    >
                      <span>{p.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </div>

        {showCustomInputs && filters.range === "custom" && (
          <>
            <Input
              type="datetime-local"
              value={datetimeLocalValue(filters.from, tz)}
              onChange={(e) =>
                setFilters({ from: datetimeLocalToIso(e.target.value, tz) })
              }
              aria-label="Custom range start"
              className="h-8 w-52"
            />
            <Input
              type="datetime-local"
              value={datetimeLocalValue(filters.to, tz)}
              onChange={(e) =>
                setFilters({ to: datetimeLocalToIso(e.target.value, tz) })
              }
              aria-label="Custom range end"
              className="h-8 w-52"
            />
          </>
        )}

        <DebouncedListInput
          value={filters.models}
          onChange={(next) => setFilters({ models: next })}
          placeholder="model filter (comma-separated)"
          ariaLabel="model filter"
        />

        <DebouncedListInput
          value={filters.agents}
          onChange={(next) => setFilters({ agents: next })}
          placeholder="agent filter (comma-separated)"
          ariaLabel="agent filter"
        />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Granularity</span>
          <Select
            value={filters.granularity}
            onValueChange={(v) => setFilters({ granularity: v as Granularity })}
          >
            <SelectTrigger className="h-8 w-20" aria-label="Granularity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRANS.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {chips.length > 0 && (
        <div
          data-testid="filter-chip-row"
          className="mt-2 flex flex-wrap items-center gap-1.5"
        >
          {chips}
        </div>
      )}
      </div>
    </div>
  );
}

// `TimeRange` re-exported to keep the original public surface stable for any
// future caller. (The previous module exported only `FilterBar`.)
export type { TimeRange };
