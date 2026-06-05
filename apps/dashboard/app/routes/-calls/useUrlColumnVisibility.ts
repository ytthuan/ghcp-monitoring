import { useCallback, useEffect, useState } from "react";

/**
 * Visible-column persistence for the Calls table.
 *
 * Storage strategy:
 *   - Source of truth is component state (`visible`).
 *   - On mount, hydrate from `?cols=a,b,c` in window.location.search.
 *   - On change, replace the URL via window.history.replaceState (does NOT
 *     re-render the route or re-fetch data) so the URL is shareable and
 *     refresh-stable.
 *   - We deliberately bypass TanStack Router's per-route `validateSearch`
 *     because `cols` is a UI-only param that should never interact with
 *     the loader / query cache.
 *   - Empty / missing `cols` means "use defaults".
 *
 * IDs in `all` must be the TanStack column ids used in the table.
 */
export function useUrlColumnVisibility(opts: {
  all: readonly string[];
  defaults: readonly string[];
}): {
  visible: ReadonlySet<string>;
  isVisible: (id: string) => boolean;
  toggle: (id: string, on: boolean) => void;
  setAll: (ids: readonly string[]) => void;
  visibleArray: string[];
} {
  const { all, defaults } = opts;

  const [visible, setVisible] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set(defaults);
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("cols");
    if (!raw) return new Set(defaults);
    const parsed = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => all.includes(s));
    return parsed.length ? new Set(parsed) : new Set(defaults);
  });

  // Push back to URL on change (without router navigation).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const isDefault =
      visible.size === defaults.length &&
      defaults.every((d) => visible.has(d));
    if (isDefault) {
      params.delete("cols");
    } else {
      // Preserve declared column order (`all`) for a stable, diff-friendly URL.
      const ordered = all.filter((id) => visible.has(id));
      params.set("cols", ordered.join(","));
    }
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
  }, [visible, all, defaults]);

  const isVisible = useCallback((id: string) => visible.has(id), [visible]);
  const toggle = useCallback((id: string, on: boolean) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const setAll = useCallback((ids: readonly string[]) => {
    setVisible(new Set(ids));
  }, []);

  const visibleArray = all.filter((id) => visible.has(id));
  return { visible, isVisible, toggle, setAll, visibleArray };
}
