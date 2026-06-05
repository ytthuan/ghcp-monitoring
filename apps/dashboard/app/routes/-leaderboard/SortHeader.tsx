import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "~/lib/utils";

export type SortDir = "asc" | "desc" | null;

export function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
  className?: string;
}) {
  const showDir = active ? dir : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-sort={
        showDir === "asc"
          ? "ascending"
          : showDir === "desc"
            ? "descending"
            : "none"
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        align === "right" && "justify-end w-full",
        className,
      )}
    >
      <span>{label}</span>
      {showDir === "asc" ? (
        <ChevronUp className="h-3.5 w-3.5" aria-hidden />
      ) : showDir === "desc" ? (
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
      )}
    </button>
  );
}
