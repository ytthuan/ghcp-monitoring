"use client";
/**
 * Conditional disclosure badge for Copilot-internal models (e.g.
 * `copilot-nes-oct`). These models have no public per-token rate because
 * they are bundled in the Copilot subscription — the badge surfaces that
 * fact next to the model name in tables, cards, and dialogs.
 *
 * Renders `null` for any model that `internalModelInfo()` doesn't
 * recognise, so it's safe to mount unconditionally.
 */
import { Info } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { internalModelInfo } from "~/server/pricing";

export interface InternalModelBadgeProps {
  /** Model name to look up (request_model / response_model / either). */
  model: string | null | undefined;
  /** Optional className passthrough for layout tweaks. */
  className?: string;
  /** `pill` for table cells, `inline` for tight inline contexts. */
  variant?: "pill" | "inline";
}

export function InternalModelBadge({
  model,
  className,
  variant = "pill",
}: InternalModelBadgeProps) {
  const info = internalModelInfo(model);
  if (!info) return null;

  const ariaLabel = `Copilot-internal model: ${info.description}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid="internal-model-badge"
          aria-label={ariaLabel}
          className={cn(
            "inline-flex items-center gap-1 align-middle text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md",
            className,
          )}
        >
          {variant === "pill" ? (
            <Badge
              variant="secondary"
              className="gap-1 px-1.5 py-0 text-[10px] font-medium leading-4"
            >
              Included
              <Info className="h-3 w-3" aria-hidden="true" />
            </Badge>
          ) : (
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[280px] text-xs leading-snug"
      >
        {info.description}
      </TooltipContent>
    </Tooltip>
  );
}
