import type { ReactNode } from "react";

export function MetricGroup({
  children,
  cols = 4,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4 | 6;
}) {
  const cls =
    cols === 6
      ? "grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
      : cols === 4
        ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        : cols === 3
          ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          : "grid grid-cols-1 gap-3 sm:grid-cols-2";
  return <div className={cls}>{children}</div>;
}
