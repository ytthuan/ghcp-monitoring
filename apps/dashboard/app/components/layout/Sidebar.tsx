"use client";
import { useCallback, useEffect, useState } from "react";
import { Activity, ChevronsLeft, ChevronsRight } from "lucide-react";
import { SidebarNav } from "./SidebarNav";
import { cn } from "~/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

const STORAGE_KEY = "dashboard:sidebar:collapsed";

const subscribers = new Set<(v: boolean) => void>();
function broadcast(v: boolean): void {
  for (const fn of subscribers) fn(v);
}

function readStored(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Collapse state lives in localStorage under `dashboard:sidebar:collapsed`.
 * Module-level pub/sub so any consumer in the same tab stays in sync (the
 * `storage` event only fires in OTHER tabs).
 */
export function useSidebarCollapsed(): {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
} {
  const [collapsed, setCollapsedState] = useState<boolean>(false);
  useEffect(() => {
    setCollapsedState(readStored());
    subscribers.add(setCollapsedState);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setCollapsedState(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => {
      subscribers.delete(setCollapsedState);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setCollapsed = useCallback((v: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      // ignore storage failures
    }
    setCollapsedState(v);
    broadcast(v);
  }, []);

  const toggle = useCallback(
    () => setCollapsed(!collapsed),
    [collapsed, setCollapsed],
  );

  return { collapsed, setCollapsed, toggle };
}

export function Sidebar() {
  const { collapsed, toggle } = useSidebarCollapsed();
  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "hidden shrink-0 border-r bg-card md:flex md:flex-col",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 py-4 text-sm font-semibold",
          collapsed ? "justify-center px-0" : "px-4",
        )}
      >
        <Activity className="h-4 w-4 shrink-0" aria-hidden />
        {collapsed ? null : <span>Copilot Dashboard</span>}
      </div>
      <SidebarNav collapsed={collapsed} />
      <div
        className={cn(
          "mt-auto border-t p-2",
          collapsed ? "flex justify-center" : "flex justify-end",
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={collapsed}
              data-testid="sidebar-toggle"
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              {collapsed ? (
                <ChevronsRight className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronsLeft className="h-4 w-4" aria-hidden />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Expand sidebar" : "Collapse sidebar"}
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
