"use client";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export function FormulaBadge({
  formula,
  className,
}: {
  formula: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground ${className ?? ""}`}
          aria-label={`Formula: ${formula}`}
        >
          <Info className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="font-mono text-xs">
        {formula}
      </TooltipContent>
    </Tooltip>
  );
}
