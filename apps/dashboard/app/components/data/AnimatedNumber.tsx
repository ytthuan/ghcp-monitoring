"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Count-up number that animates 0 → value exactly once, on first mount.
 *
 * Design constraints (this is a live, auto-refreshing ops dashboard):
 *   - SSR + first client render emit the FINAL formatted value, so hydration
 *     never mismatches and no-JS users still see the real number.
 *   - The count-up runs a single time after mount. Subsequent `value` changes
 *     (react-query background refetch) snap instantly — operators never watch
 *     numbers "reset to 0" on every poll.
 *   - Honors prefers-reduced-motion (checked synchronously → no flash).
 *   - `tabular-nums` + the caller reserving width keep the 0→N ramp from
 *     reflowing the row.
 */
export function AnimatedNumber({
  value,
  format,
  durationMs = 1000,
  className,
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) {
      setDisplay(value);
      return;
    }
    ranRef.current = true;
    if (prefersReducedMotion() || !Number.isFinite(value) || value === 0) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setDisplay(value * easeOutExpo(t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className={cn("tabular-nums", className)}>{format(display)}</span>
  );
}
