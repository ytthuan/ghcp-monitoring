"use client";
import * as React from "react";
import { Search } from "lucide-react";
import { MobileNav } from "./MobileNav";
import { RefreshControl } from "./RefreshControl";
import { ThemeToggle } from "./ThemeToggle";
import { TimezoneSelect } from "./TimezoneSelect";
import { Breadcrumbs } from "./Breadcrumbs";
import { CommandPalette, useCommandPalette } from "./CommandPalette";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function Header() {
  const palette = useCommandPalette();
  // Detect platform on the client only — using `navigator` during SSR would
  // produce a "Ctrl K" hint on the server and "⌘K" on the client, triggering
  // React hydration error #418. Mount → defer to a useEffect instead.
  const [isMac, setIsMac] = React.useState(false);
  React.useEffect(() => {
    if (typeof navigator === "undefined") return;
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || ""));
  }, []);
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-2 border-b px-2 py-2 md:px-4">
      <MobileNav />
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => palette.setOpen(true)}
          aria-label="Open command palette"
          data-testid="header-search-button"
          className={cn("h-8 gap-2 px-2 text-muted-foreground", FOCUS_RING)}
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Search…</span>
          <kbd
            suppressHydrationWarning
            className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] sm:inline"
          >
            {isMac ? "⌘K" : "Ctrl K"}
          </kbd>
        </Button>
        <RefreshControl />
        <TimezoneSelect />
        <ThemeToggle />
      </div>
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
    </header>
  );
}
