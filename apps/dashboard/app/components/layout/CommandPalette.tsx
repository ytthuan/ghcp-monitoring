"use client";
/**
 * Command palette built on the existing `Dialog` primitive — no new
 * dependency. Triggered globally by ⌘K (macOS) or Ctrl+K (other), Esc closes
 * (Dialog handles), arrow keys move selection, Enter activates.
 *
 * SAFETY: Per `polish-spec.md` §11 and Wave 4 audit, this palette MUST NOT
 * surface raw prompt / response / tool-arg / tool-result text. We only
 * enumerate route labels, range presets, theme + timezone actions. There is
 * NO "recent telemetry" section in Wave 2 and none of the action sources
 * can carry user content.
 */
import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import {
  Compass,
  Calendar,
  Sun,
  Moon,
  Globe,
  Search,
  CornerDownLeft,
} from "lucide-react";
import { Dialog, DialogContent } from "~/components/ui/dialog";
import { useFilters } from "~/lib/use-filters";
import { useTimezone } from "~/lib/use-timezone";
import { ITEMS as NAV_ITEMS } from "./SidebarNav";
import {
  RANGE_PRESETS,
  applyRangePreset,
  type RangePreset,
} from "./FilterBar";
import { cn } from "~/lib/utils";

type Action = {
  id: string;
  group: "Navigation" | "Range" | "Theme" | "Timezone";
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
};

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function useCommandPalette(): {
  open: boolean;
  setOpen: (v: boolean) => void;
} {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isToggle =
        (e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey);
      if (!isToggle) return;
      // Don't intercept when the user is typing in a normal input that wants
      // ⌘K (we don't have any, but be polite).
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const { setFilters } = useFilters();
  const { tz, setTz } = useTimezone();
  const { setTheme, resolvedTheme } = useTheme();

  const actions = React.useMemo<Action[]>(() => {
    const navActions: Action[] = NAV_ITEMS.map((it) => ({
      id: `nav:${it.to}`,
      group: "Navigation",
      label: `Go to ${it.label}`,
      icon: Compass,
      run: () =>
        void navigate({
          to: it.to,
          search: (prev: Record<string, unknown>) => prev,
        }),
    }));
    const rangeActions: Action[] = RANGE_PRESETS.map((p: RangePreset) => ({
      id: `range:${p.id}`,
      group: "Range",
      label: `Set range to ${p.label}`,
      icon: Calendar,
      run: () => applyRangePreset(p, setFilters, tz),
    }));
    const themeActions: Action[] = [
      {
        id: "theme:toggle",
        group: "Theme",
        label: "Toggle theme",
        hint: resolvedTheme === "dark" ? "→ light" : "→ dark",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
    ];
    const tzActions: Action[] = [
      {
        id: "tz:utc",
        group: "Timezone",
        label: "Set timezone to UTC",
        icon: Globe,
        run: () => setTz("UTC"),
      },
      {
        id: "tz:local",
        group: "Timezone",
        label: "Set timezone to Local (browser)",
        icon: Globe,
        run: () => setTz("local"),
      },
    ];
    return [...navActions, ...rangeActions, ...themeActions, ...tzActions];
  }, [navigate, resolvedTheme, setFilters, setTheme, setTz, tz]);

  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [actions, query]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const runAt = React.useCallback(
    (i: number) => {
      const a = filtered[i];
      if (!a) return;
      onOpenChange(false);
      // Defer so the dialog unmounts cleanly before navigation/state changes.
      setTimeout(() => a.run(), 0);
    },
    [filtered, onOpenChange],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % Math.max(filtered.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(activeIndex);
    }
  };

  // Group filtered items by group label, preserving order of first appearance.
  const groups = React.useMemo(() => {
    const map = new Map<string, Action[]>();
    for (const a of filtered) {
      const arr = map.get(a.group) ?? [];
      arr.push(a);
      map.set(a.group, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="command-palette"
        className="max-h-[70vh] sm:max-h-[60vh]"
      >
        <div
          role="combobox"
          aria-expanded
          aria-haspopup="listbox"
          aria-controls="command-palette-list"
          onKeyDown={onKeyDown}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              data-autofocus
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search actions, pages, ranges…"
              aria-label="Command palette search"
              className={cn(
                "h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground",
              )}
            />
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
              Esc
            </kbd>
          </div>
          <div
            id="command-palette-list"
            role="listbox"
            aria-label="Command palette results"
            className="flex-1 overflow-auto py-2"
          >
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                No actions match.
              </div>
            ) : (
              groups.map(([group, items]) => (
                <div key={group} className="mb-1">
                  <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group}
                  </div>
                  {items.map((a) => {
                    const idx = filtered.indexOf(a);
                    const active = idx === activeIndex;
                    const Icon = a.icon;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => runAt(idx)}
                        className={cn(
                          "flex w-full items-center gap-2 px-4 py-2 text-left text-sm",
                          active
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground hover:bg-accent/50",
                          FOCUS_RING,
                        )}
                      >
                        <Icon
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="flex-1 truncate">{a.label}</span>
                        {a.hint ? (
                          <span className="text-xs text-muted-foreground">
                            {a.hint}
                          </span>
                        ) : null}
                        {active ? (
                          <CornerDownLeft
                            className="h-3.5 w-3.5 text-muted-foreground"
                            aria-hidden
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CommandPalette;
