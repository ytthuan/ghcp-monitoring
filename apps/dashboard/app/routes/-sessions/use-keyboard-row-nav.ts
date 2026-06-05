"use client";
/**
 * Local keyboard row-nav hook. Wave-3 polish-spec describes
 * `app/lib/use-keyboard-row-nav.ts`, but to avoid stomping on parallel
 * Wave-3 subagents (`polish-calls`, `polish-traces`) that may also create
 * that file, this `polish-sessions` subagent owns its own copy under
 * `app/routes/-sessions/` (TanStack Router ignores `-` prefixed dirs).
 *
 * Bindings: `j` / `ArrowDown` → next, `k` / `ArrowUp` → prev, `Enter` →
 * `onActivate(activeIndex)`. Ignores key events whose target is inside an
 * input/textarea/contenteditable.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface Opts {
  enabled?: boolean;
  initialIndex?: number;
}

export interface KeyboardRowNav {
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  rowProps: (i: number) => {
    "data-active": "true" | undefined;
    tabIndex: number;
    onFocus: () => void;
  };
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}

export function useKeyboardRowNav(
  rowCount: number,
  onActivate?: (index: number) => void,
  opts?: Opts,
): KeyboardRowNav {
  const enabled = opts?.enabled ?? true;
  const [activeIndex, setActiveIndex] = useState<number>(opts?.initialIndex ?? 0);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  useEffect(() => {
    if (!enabled || rowCount <= 0) return;
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(rowCount - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        const fn = onActivateRef.current;
        if (fn) {
          e.preventDefault();
          fn(activeIndex);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, rowCount, activeIndex]);

  // Clamp if rowCount shrinks
  useEffect(() => {
    if (activeIndex >= rowCount) setActiveIndex(Math.max(0, rowCount - 1));
  }, [rowCount, activeIndex]);

  const rowProps = useCallback(
    (i: number) => ({
      "data-active": (i === activeIndex ? "true" : undefined) as
        | "true"
        | undefined,
      tabIndex: i === activeIndex ? 0 : -1,
      onFocus: () => setActiveIndex(i),
    }),
    [activeIndex],
  );

  return { activeIndex, setActiveIndex, rowProps };
}
