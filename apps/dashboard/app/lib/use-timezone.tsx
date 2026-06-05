"use client";
/**
 * Centralised timezone state for the dashboard.
 *
 * Goals:
 *   1. Single source of truth — `<TimezoneProvider>` wraps the app shell so
 *      every component reads the same `tz` via React context. No more
 *      per-component `useState` + module-level pub/sub drift.
 *   2. Sensible default — when the user has no stored preference, the UI
 *      defaults to the browser's IANA timezone (`"local"`). This avoids the
 *      footgun of "everything renders UTC even though the operator is in
 *      Bangkok".
 *   3. SSR-safe — the very first client render must match the SSR HTML
 *      (which has no `window`, no `localStorage`). We initialise to
 *      `"UTC"` on both server and client, then move to the resolved
 *      preference in a post-mount `useEffect`. Without this, React 19
 *      complains about hydration mismatches on every timestamp cell.
 *   4. Defensive — invalid stored values (renamed zones, typos) silently
 *      fall back to `"local"` rather than crashing `Intl.DateTimeFormat`.
 *   5. Backward compatible — components rendered outside the provider
 *      (e.g. isolated unit tests) still work via a module-level fallback
 *      store. The fallback warns in development so we notice strays.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "ghcp-dashboard-tz";

/** SSR / pre-hydration fallback. Matches what the server renders. */
const SSR_TZ = "UTC";

/** Sentinel for "use the browser's resolved IANA timezone". */
export const LOCAL_TZ_SENTINEL = "local";

export const TIMEZONES: ReadonlyArray<{ value: string; label: string }> = [
  { value: LOCAL_TZ_SENTINEL, label: "Local (browser)" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Bangkok", label: "Bangkok" },
  { value: "Australia/Sydney", label: "Sydney" },
];

const KNOWN_VALUES = new Set(TIMEZONES.map((t) => t.value));

/** True when the value is a recognised IANA zone the runtime can format. */
function isValidTimezone(value: string | null | undefined): value is string {
  if (!value) return false;
  if (value === LOCAL_TZ_SENTINEL) return true;
  if (KNOWN_VALUES.has(value)) return true;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isValidTimezone(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStored(value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* quota / disabled storage — silent */
  }
}

// ─── Module-level fallback store ──────────────────────────────────────────
//
// Only used by components that render OUTSIDE the provider (mostly tests
// and ad-hoc dev surfaces). Real app code goes through the context.

const fallbackSubscribers = new Set<(tz: string) => void>();
let fallbackTz: string = SSR_TZ;

function setFallbackTz(value: string): void {
  fallbackTz = value;
  for (const fn of fallbackSubscribers) fn(value);
}

// ─── Context ──────────────────────────────────────────────────────────────

interface TimezoneContextValue {
  tz: string;
  setTz: (value: string) => void;
}

const TimezoneContext = createContext<TimezoneContextValue | null>(null);

/**
 * Owns timezone state for the entire app. Mount this once near the root
 * (above any component that calls `useTimezone()`).
 */
export function TimezoneProvider({ children }: { children: ReactNode }) {
  // SSR-safe initial value — must match the server render.
  const [tz, setTzState] = useState<string>(SSR_TZ);

  // Post-mount hydration: pick the stored value or default to "local".
  useEffect(() => {
    const stored = readStored();
    const next = stored ?? LOCAL_TZ_SENTINEL;
    setTzState(next);
    setFallbackTz(next);

    // React to changes from OTHER tabs.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const incoming =
        event.newValue && isValidTimezone(event.newValue)
          ? event.newValue
          : LOCAL_TZ_SENTINEL;
      setTzState(incoming);
      setFallbackTz(incoming);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTz = useCallback((value: string) => {
    const safe = isValidTimezone(value) ? value : LOCAL_TZ_SENTINEL;
    writeStored(safe);
    setTzState(safe);
    setFallbackTz(safe);
  }, []);

  const ctx = useMemo<TimezoneContextValue>(() => ({ tz, setTz }), [tz, setTz]);
  return (
    <TimezoneContext.Provider value={ctx}>{children}</TimezoneContext.Provider>
  );
}

/**
 * Read the active timezone preference. Components inside `<TimezoneProvider>`
 * share the same value reactively. Components outside the provider fall
 * back to a module-level store so unit tests and isolated stories still
 * function (with a dev-mode warning so we catch unintentional escapes).
 */
export function useTimezone(): { tz: string; setTz: (value: string) => void } {
  const ctx = useContext(TimezoneContext);
  // The fallback hook is always called so React's hook count is stable
  // regardless of whether the provider is present.
  const fallback = useFallbackTimezone(ctx === null);
  if (ctx) return ctx;
  if (
    typeof process !== "undefined" &&
    process.env?.NODE_ENV !== "production"
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      "useTimezone() called outside <TimezoneProvider>. Using fallback store.",
    );
  }
  return fallback;
}

function useFallbackTimezone(active: boolean): {
  tz: string;
  setTz: (value: string) => void;
} {
  const [tz, setTzState] = useState<string>(SSR_TZ);
  useEffect(() => {
    if (!active) return;
    setTzState(fallbackTz);
    fallbackSubscribers.add(setTzState);
    return () => {
      fallbackSubscribers.delete(setTzState);
    };
  }, [active]);
  const setTz = useCallback((value: string) => {
    const safe = isValidTimezone(value) ? value : LOCAL_TZ_SENTINEL;
    writeStored(safe);
    setFallbackTz(safe);
  }, []);
  return { tz, setTz };
}

// ─── Resolution helpers ───────────────────────────────────────────────────

/**
 * Pass through to `Intl.DateTimeFormat`'s `timeZone` option. Returns
 * `undefined` for the `"local"` sentinel so `Intl` uses the runtime
 * default (browser tz on the client, server tz on the server).
 */
export function resolveTz(tz: string): string | undefined {
  if (tz === LOCAL_TZ_SENTINEL) return undefined;
  return tz;
}

/** Return the browser's IANA timezone (or `"UTC"` when unavailable). */
export function browserTimezone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return detected || SSR_TZ;
  } catch {
    return SSR_TZ;
  }
}

/**
 * Resolve the active preference into a concrete IANA name suitable for
 * passing to ClickHouse / server-side timezone-aware functions. Always
 * returns a real zone, never the `"local"` sentinel.
 *
 * IMPORTANT: only call this on the client (e.g. inside React Query
 * `queryFn` callbacks). On the server `browserTimezone()` would resolve
 * to the *server's* timezone, which is not what the user wants.
 */
export function resolveQueryTz(tz: string): string {
  if (!tz || tz === LOCAL_TZ_SENTINEL) return browserTimezone();
  return tz;
}

/**
 * Human-friendly label for the current preference. For the `"local"`
 * sentinel, includes the resolved IANA name so the operator knows what
 * "Local" means right now (e.g. `Local (Asia/Bangkok)`).
 */
export function timezoneLabel(tz: string): string {
  if (tz === LOCAL_TZ_SENTINEL) return `Local (${browserTimezone()})`;
  return tz || SSR_TZ;
}

// ─── Formatting ───────────────────────────────────────────────────────────

function toDate(input: string | number | Date): Date {
  // ClickHouse may return ISO-like timestamps without a trailing `Z` (e.g.
  // historical rows before the SQL Z-suffix landed). JS `new Date(...)`
  // would then parse them as local time. Coerce bare ISO to UTC.
  if (
    typeof input === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(input)
  ) {
    return new Date(`${input}Z`);
  }
  return new Date(input);
}

const DEFAULT_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

/**
 * Format an instant in the active timezone. Always passes through
 * `resolveTz(tz)` so callers can hand us the user's preference (including
 * the `"local"` sentinel) without thinking about resolution.
 */
export function formatInTz(
  iso: string | number | Date,
  tz: string,
  opts: Intl.DateTimeFormatOptions = DEFAULT_FORMAT_OPTIONS,
): string {
  const d = toDate(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      ...opts,
      timeZone: resolveTz(tz),
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: SSR_TZ }).format(d);
  }
}

export function formatTimestampInTz(iso: string, tz: string): string {
  return formatInTz(iso, tz);
}

export function formatHourLabelInTz(
  iso: string | number | Date,
  tz: string,
): string {
  return formatInTz(iso, tz, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
}
