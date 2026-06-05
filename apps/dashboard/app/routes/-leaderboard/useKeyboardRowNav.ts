import { useCallback, useEffect, useState } from "react";

/**
 * j/k (or ArrowDown/ArrowUp) navigates between rows; Enter activates.
 * Ignored when focus is inside an input/textarea/contenteditable.
 */
export function useKeyboardRowNav(
  rowCount: number,
  onActivate?: (index: number) => void,
  opts?: { enabled?: boolean; initialIndex?: number },
): {
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  rowProps: (i: number) => {
    "data-active": boolean | undefined;
    tabIndex: number;
    onFocus: () => void;
  };
} {
  const enabled = opts?.enabled ?? true;
  const [activeIndex, setActiveIndex] = useState<number>(opts?.initialIndex ?? -1);

  useEffect(() => {
    if (!enabled || rowCount <= 0) return;
    function isTextTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      if (isTextTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(rowCount - 1, i < 0 ? 0 : i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i < 0 ? 0 : i - 1));
      } else if (e.key === "Enter") {
        if (activeIndex >= 0 && activeIndex < rowCount) {
          e.preventDefault();
          onActivate?.(activeIndex);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, rowCount, activeIndex, onActivate]);

  const rowProps = useCallback(
    (i: number) => ({
      "data-active": (i === activeIndex ? true : undefined) as
        | boolean
        | undefined,
      tabIndex: 0,
      onFocus: () => setActiveIndex(i),
    }),
    [activeIndex],
  );

  return { activeIndex, setActiveIndex, rowProps };
}
