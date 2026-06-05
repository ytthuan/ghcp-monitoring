"use client";
/**
 * Breadcrumbs derived from the current router matches. We deliberately keep
 * a centralized pathname → label map here (rather than putting `staticData`
 * on every route file) because Wave 2 must not edit any route file other
 * than `__root.tsx`. See `app/lib/polish-spec.md` §5.
 *
 * Detail routes (`/traces/$traceId`, `/sessions/$id`) additionally render a
 * back link to the parent list above the title, preserving the user's search
 * params via TanStack Router's `search={(prev) => prev}` pattern.
 */
import { Link, useMatches } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

interface RouteMeta {
  label: string;
  parent?: { to: string; label: string };
}

const STATIC_LABELS: Record<string, RouteMeta> = {
  "/": { label: "Totals" },
  "/trends": { label: "Trends" },
  "/models": { label: "Models" },
  "/agents": { label: "Agents" },
  "/calls": { label: "Calls" },
  "/traces": { label: "Traces" },
  "/sessions": { label: "Sessions" },
  "/cache": { label: "Cache" },
  "/latency": { label: "Latency" },
  "/ttft": { label: "TTFT" },
  "/tools": { label: "Tools" },
  "/heatmap": { label: "Heatmap" },
  "/finish": { label: "Finish reasons" },
  "/logs": { label: "Logs" },
};

function shortId(id: string | undefined): string {
  if (!id) return "";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function metaForLeaf(
  pathname: string,
  params: Record<string, string>,
): RouteMeta | null {
  // Detail routes — params-driven labels.
  if (params["traceId"]) {
    return {
      label: `Trace ${shortId(params["traceId"])}`,
      parent: { to: "/traces", label: "Traces" },
    };
  }
  if (params["id"] && pathname.startsWith("/sessions/")) {
    return {
      label: `Session ${shortId(params["id"])}`,
      parent: { to: "/sessions", label: "Sessions" },
    };
  }
  return STATIC_LABELS[pathname] ?? null;
}

export interface CrumbsResult {
  current: string;
  parent: { to: string; label: string } | null;
  pathname: string;
}

/** Pure helper used by Header to render the contextual title. */
export function useCrumbs(): CrumbsResult {
  const matches = useMatches();
  const leaf = matches[matches.length - 1];
  const pathname = leaf?.pathname ?? "/";
  const params = (leaf?.params ?? {}) as Record<string, string>;
  const meta = metaForLeaf(pathname, params);
  return {
    current: meta?.label ?? "Dashboard",
    parent: meta?.parent ?? null,
    pathname,
  };
}

export function Breadcrumbs({ className }: { className?: string }) {
  const { current, parent } = useCrumbs();
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {parent ? (
        <>
          <Link
            to={parent.to}
            search={(prev: Record<string, unknown>) => prev}
            className={cn(
              "hover:text-foreground rounded-sm",
              FOCUS_RING,
            )}
          >
            {parent.label}
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
        </>
      ) : null}
      <span aria-current="page" className="text-foreground font-medium">
        {current}
      </span>
    </nav>
  );
}

/**
 * Renders an in-page back link above the title for detail routes.
 * Returns null on list/index routes.
 */
export function DetailBackLink({ className }: { className?: string }) {
  const { parent } = useCrumbs();
  if (!parent) return null;
  return (
    <Link
      to={parent.to}
      search={(prev: Record<string, unknown>) => prev}
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded-sm",
        FOCUS_RING,
        className,
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Back to {parent.label.toLowerCase()}
    </Link>
  );
}

export default Breadcrumbs;
