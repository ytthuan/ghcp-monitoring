import { useEffect, type RefObject } from "react";

/** When activeIndex changes, focus the matching <tr>. */
export function useFocusActiveRow(
  ref: RefObject<HTMLTableSectionElement | null>,
  activeIndex: number,
): void {
  useEffect(() => {
    if (activeIndex < 0 || !ref.current) return;
    const rows = ref.current.querySelectorAll<HTMLTableRowElement>("tr");
    const el = rows[activeIndex];
    if (el && document.activeElement !== el) el.focus();
  }, [ref, activeIndex]);
}
