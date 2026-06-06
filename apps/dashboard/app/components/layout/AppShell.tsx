"use client";
import { useRouterState } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { FilterBar } from "./FilterBar";
import { LanBanner } from "./LanBanner";
import { RevealBanner } from "./RevealBanner";
import { ErrorBoundary } from "./ErrorBoundary";
import { AuroraBackground } from "./AuroraBackground";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Key the content wrapper by the matched leaf route id (not the full
  // pathname) so a param-only navigation — e.g. /traces/$traceId between two
  // ids — does NOT remount and replay the entrance, while a real route change
  // does. The entrance is opacity-only, so it never perturbs scroll
  // restoration or the sticky FilterBar / anchor-nav offset math.
  const routeId = useRouterState({
    select: (s) => s.matches[s.matches.length - 1]?.routeId ?? "root",
  });
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <AuroraBackground />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <LanBanner />
        <Header />
        <RevealBanner />
        {/*
          Single scroll container. The FilterBar uses sticky-position so it
          stays visible while the page content scrolls under it. Crucially
          the FilterBar lives INSIDE the scroll container — putting it
          outside (with overflow:auto on a sibling) would defeat sticky.
        */}
        <main className="relative flex-1 overflow-auto">
          <FilterBar />
          <div className="p-4">
            <ErrorBoundary>
              <div key={routeId} className="anim-enter">
                {children}
              </div>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
