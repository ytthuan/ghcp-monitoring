"use client";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  Bot,
  Boxes,
  Clock,
  Database,
  FileText,
  Flag,
  Gauge,
  Grid3x3,
  Home,
  ListChecks,
  MessageSquare,
  Network,
  Wrench,
} from "lucide-react";
import { cn } from "~/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Totals", icon: Home },
      { to: "/trends", label: "Trends", icon: BarChart3 },
    ],
  },
  {
    label: "Telemetry",
    items: [
      { to: "/models", label: "Models", icon: Boxes },
      { to: "/agents", label: "Agents", icon: Bot },
      { to: "/calls", label: "Calls", icon: ListChecks },
      { to: "/traces", label: "Traces", icon: Network },
      { to: "/sessions", label: "Sessions", icon: MessageSquare },
      { to: "/cache", label: "Cache", icon: Database },
      { to: "/latency", label: "Latency", icon: Gauge },
      { to: "/ttft", label: "TTFT", icon: Clock },
      { to: "/tools", label: "Tools", icon: Wrench },
      { to: "/heatmap", label: "Heatmap", icon: Grid3x3 },
      { to: "/finish", label: "Finish reasons", icon: Flag },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/logs", label: "Logs", icon: FileText },
    ],
  },
];

// Flat list — preserved for any consumer (e.g. CommandPalette) that wants
// every nav item without caring about group structure.
export const ITEMS: NavItem[] = GROUPS.flatMap((g) => g.items);

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className={cn("flex-1 space-y-3 pb-4", collapsed ? "px-1.5" : "px-2")}
      aria-label="Primary"
    >
      {GROUPS.map((group) => (
        <div key={group.label} className="space-y-0.5">
          {collapsed ? (
            <div className="mx-2 my-2 h-px bg-border first:hidden" aria-hidden />
          ) : (
            <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </div>
          )}
          {group.items.map((it) => (
            <NavLink
              key={it.to}
              item={it}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      to={item.to}
      search={(prev: Record<string, unknown>) => prev}
      activeOptions={{ exact: item.to === "/" }}
      onClick={() => onNavigate?.()}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center rounded-md text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        "data-[status=active]:bg-accent data-[status=active]:text-accent-foreground",
        FOCUS_RING,
        collapsed
          ? "h-9 w-9 justify-center"
          : "gap-2 px-3 py-2",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {collapsed ? null : <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export default SidebarNav;
