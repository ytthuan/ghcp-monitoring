import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export function useSorted<T, K extends string>(
  rows: ReadonlyArray<T>,
  initialKey: K,
  initialDir: SortDir,
  getValue: (row: T, key: K) => number | string | null | undefined,
): {
  sorted: T[];
  sortKey: K;
  sortDir: SortDir;
  toggle: (key: K) => void;
} {
  const [sortKey, setSortKey] = useState<K>(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);

  const sorted = useMemo(() => {
    const arr = rows.slice();
    arr.sort((a, b) => {
      const av = getValue(a, sortKey);
      const bv = getValue(b, sortKey);
      const an = av == null ? -Infinity : typeof av === "number" ? av : NaN;
      const bn = bv == null ? -Infinity : typeof bv === "number" ? bv : NaN;
      let cmp: number;
      if (Number.isNaN(an) || Number.isNaN(bn)) {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      } else {
        cmp = an - bn;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir, getValue]);

  function toggle(key: K) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return { sorted, sortKey, sortDir, toggle };
}
