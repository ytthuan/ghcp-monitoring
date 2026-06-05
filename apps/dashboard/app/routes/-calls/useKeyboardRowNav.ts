import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keyboard row navigation hook (j/k/ArrowDown/ArrowUp/Enter/Esc).
 *
 * - Ignores key events when focus is inside an input/textarea/select/
 *   contenteditable element so it doesn't fight typing in the FilterBar
 *   or any inline editor.
 * - Does NOT call preventDefault for navigation keys other than j/k —
 *   ArrowDown/Up still work for browser/router default behavior in most
 *   contexts; we only intercept when the page itself owns focus.
 * - `onActivate` fires on Enter; consumers typically call `navigate()` to
 *   open a detail view. This is fully complementary to TanStack Router —
 *   we never block its key handling.
 */
export function useKeyboardRowNav(
  rowCount: number,
  onActivate?: (index: number) => void,
  opts?: { enabled?: boolean; initialIndex?: number },
): {
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  rowProps: (i: number) => {
    "data-active": "true" | undefined;
    tabIndex: 0;
    onFocus: () => void;
  };
} {
  const enabled = opts?.enabled ?? true;
  const [activeIndex, setActiveIndex] = useState(opts?.initialIndex ?? -1);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  // Reset focus when the row count drops below the current index (e.g. after
  // a filter change shrinks the page).
  useEffect(() => {
    if (activeIndex >= rowCount) setActiveIndex(rowCount > 0 ? rowCount - 1 : -1);
  }, [rowCount, activeIndex]);

  useEffect(() => {
    if (!enabled || rowCount === 0) return;
    function inEditable(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    }
    function handler(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (inEditable(e.target)) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(rowCount - 1, Math.max(0, i + 1)));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? 0 : i - 1));
      } else if (e.key === "Enter") {
        if (activeIndex >= 0 && activeIndex < rowCount) {
          // Don't intercept if focus is on a button/link inside a row — let
          // the native activation win.
          const tag = (e.target as HTMLElement | null)?.tagName;
          if (tag === "BUTTON" || tag === "A") return;
          e.preventDefault();
          onActivateRef.current?.(activeIndex);
        }
      } else if (e.key === "Escape") {
        setActiveIndex(-1);
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, rowCount, activeIndex]);

  const rowProps = useCallback(
    (i: number) => ({
      "data-active": (i === activeIndex ? "true" : undefined) as "true" | undefined,
      tabIndex: 0 as const,
      onFocus: () => setActiveIndex(i),
    }),
    [activeIndex],
  );

  return { activeIndex, setActiveIndex, rowProps };
}
