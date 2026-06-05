"use client";
/**
 * `j` / `ArrowDown` → next, `k` / `ArrowUp` → prev, `Enter` → activate.
 * Ignores key events when focus is inside an input / textarea /
 * contenteditable so users can keep typing in filter inputs without
 * stealing the cursor. Signature mirrors the contract in
 * `app/lib/polish-spec.md` §3.
 *
 * Lives under `routes/-traces/` because Wave-3 polish-traces owns this
 * surface; sibling polish subagents define the same hook in their own
 * scoped folder. A future cleanup may consolidate to `app/lib/`.
 */
import { useCallback, useEffect, useState } from "react";

export interface UseKeyboardRowNavResult {
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  rowProps: (i: number) => {
    "data-active": boolean | undefined;
    tabIndex: number;
    onFocus: () => void;
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardRowNav(
  rowCount: number,
  onActivate?: (index: number) => void,
  opts?: { enabled?: boolean; initialIndex?: number },
): UseKeyboardRowNavResult {
  const enabled = opts?.enabled ?? true;
  const [activeIndex, setActiveIndex] = useState(opts?.initialIndex ?? 0);

  // Clamp when row count shrinks.
  useEffect(() => {
    if (rowCount === 0) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= rowCount) setActiveIndex(rowCount - 1);
  }, [rowCount, activeIndex]);

  useEffect(() => {
    if (!enabled || rowCount === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(rowCount - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        if (!onActivate) return;
        e.preventDefault();
        onActivate(activeIndex);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, rowCount, activeIndex, onActivate]);

  const rowProps = useCallback(
    (i: number) => ({
      "data-active": i === activeIndex ? true : undefined,
      tabIndex: i === activeIndex ? 0 : -1,
      onFocus: () => setActiveIndex(i),
    }),
    [activeIndex],
  );

  return { activeIndex, setActiveIndex, rowProps };
}
