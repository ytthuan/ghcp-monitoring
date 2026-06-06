"use client";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  Radio,
  Tag,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { CommandStripState, IngestState } from "~/lib/overview-signals";

type Tone = "ok" | "warn" | "crit" | "muted";

const TONE_DOT: Record<Tone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  crit: "bg-red-500",
  muted: "bg-muted-foreground/50",
};

const TONE_TEXT: Record<Tone, string> = {
  ok: "text-foreground",
  warn: "text-amber-700 dark:text-amber-400",
  crit: "text-red-700 dark:text-red-400",
  muted: "text-muted-foreground",
};

function ingestTone(state: IngestState): Tone {
  if (state === "live") return "ok";
  if (state === "recent") return "warn";
  return "crit";
}

function Chip({
  icon,
  tone,
  label,
  value,
  detail,
  dot = false,
}: {
  icon: ReactNode;
  tone: Tone;
  label: string;
  value: string;
  detail: string;
  dot?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex min-w-0 items-center gap-2 rounded-md border bg-card/80 px-2.5 py-1.5"
          aria-label={`${label}: ${value}. ${detail}`}
        >
          {dot ? (
            <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden />
          ) : (
            <span className={cn("shrink-0", TONE_TEXT[tone])} aria-hidden>
              {icon}
            </span>
          )}
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {label}
            </span>
            <span className={cn("truncate text-xs font-medium", TONE_TEXT[tone])}>
              {value}
            </span>
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left">{detail}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Compact operational topline rendered above the KPI row. Answers "is the
 * stack healthy and is this view trustworthy?" before any analytics. Every
 * cell carries a text label and tooltip so state never relies on color alone.
 */
export function CommandStrip({
  strip,
  lastSpanLabel,
  storageOk,
}: {
  strip: CommandStripState;
  lastSpanLabel: string;
  storageOk: boolean;
}) {
  const ingTone = ingestTone(strip.ingest.state);
  return (
    <div
      className="flex flex-wrap items-stretch gap-2"
      data-testid="overview-command-strip"
      role="group"
      aria-label="Operational status"
    >
      <Chip
        dot
        tone={ingTone}
        icon={<Radio className="h-3.5 w-3.5" />}
        label="Ingest"
        value={strip.ingest.label}
        detail={strip.ingest.detail}
      />
      <Chip
        tone={storageOk ? "ok" : "crit"}
        icon={<Database className="h-3.5 w-3.5" />}
        label="Storage"
        value={storageOk ? "ClickHouse OK" : "Unreachable"}
        detail={
          storageOk
            ? "ClickHouse responded to this query."
            : "ClickHouse did not respond — data may be unavailable."
        }
      />
      <Chip
        tone="muted"
        icon={<Radio className="h-3.5 w-3.5" />}
        label="Last span"
        value={lastSpanLabel}
        detail={strip.ingest.detail}
      />
      <Chip
        tone={strip.pricing.ok ? "ok" : "warn"}
        icon={<Tag className="h-3.5 w-3.5" />}
        label="Pricing"
        value={strip.pricing.label}
        detail={strip.pricing.detail}
      />
      <Chip
        tone={strip.reveal.revealed ? "warn" : "muted"}
        icon={
          strip.reveal.revealed ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )
        }
        label="Content"
        value={strip.reveal.revealed ? "Revealed" : "Redacted"}
        detail={strip.reveal.detail}
      />
      <Chip
        tone={strip.warnings > 0 ? "warn" : "ok"}
        icon={
          strip.warnings > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )
        }
        label="Findings"
        value={
          strip.warnings > 0
            ? `${strip.warnings} need${strip.warnings === 1 ? "s" : ""} attention`
            : "All clear"
        }
        detail={
          strip.warnings > 0
            ? "Open items are listed in the action queue."
            : "No warnings in the current window."
        }
      />
    </div>
  );
}
