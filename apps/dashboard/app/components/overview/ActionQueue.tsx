"use client";
import { Link } from "@tanstack/react-router";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Info,
  type LucideIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import type { ActionItem, Severity } from "~/lib/overview-signals";

const SEVERITY_META: Record<
  Severity,
  { icon: LucideIcon; text: string; bar: string; ring: string }
> = {
  critical: {
    icon: AlertOctagon,
    text: "text-red-700 dark:text-red-400",
    bar: "bg-red-500",
    ring: "border-red-500/30",
  },
  warning: {
    icon: AlertTriangle,
    text: "text-amber-700 dark:text-amber-400",
    bar: "bg-amber-500",
    ring: "border-amber-500/30",
  },
  info: {
    icon: Info,
    text: "text-sky-700 dark:text-sky-400",
    bar: "bg-sky-500",
    ring: "border-sky-500/30",
  },
  ok: {
    icon: CheckCircle2,
    text: "text-emerald-700 dark:text-emerald-400",
    bar: "bg-emerald-500",
    ring: "border-emerald-500/30",
  },
};

function Row({ item }: { item: ActionItem }) {
  const meta = SEVERITY_META[item.severity];
  const Icon = meta.icon;
  const body = (
    <div
      className={cn(
        "relative flex items-start gap-2.5 overflow-hidden rounded-md border bg-card/70 p-2.5 pl-3",
        meta.ring,
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", meta.bar)} aria-hidden />
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.text)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold">{item.title}</span>
          <span className="sr-only">{item.severity}</span>
          {item.to ? (
            <ArrowUpRight
              className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {item.evidence}
        </p>
      </div>
    </div>
  );

  if (!item.to) return body;
  return (
    <Link
      to={item.to}
      search={(prev: Record<string, unknown>) => prev}
      className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:brightness-[0.99]"
    >
      {body}
    </Link>
  );
}

/**
 * Prioritized list of conditions that need attention, sorted by severity. Each
 * row states explicit evidence and (where applicable) deep-links into the
 * matching route, preserving the active filters via `search={prev}`.
 */
export function ActionQueue({ items }: { items: ActionItem[] }) {
  return (
    <div
      className="flex h-full flex-col gap-2"
      data-testid="action-queue-list"
      aria-label="Action queue"
    >
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed py-10 text-center">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <div className="text-sm font-medium">All clear</div>
          <p className="max-w-[16rem] text-xs text-muted-foreground">
            No cost, cache, latency, or ingest issues in the current window.
          </p>
        </div>
      ) : (
        items.map((item) => <Row key={item.id} item={item} />)
      )}
    </div>
  );
}
