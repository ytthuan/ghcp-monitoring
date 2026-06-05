"use client";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { FilterBar } from "./FilterBar";
import { LanBanner } from "./LanBanner";
import { RevealBanner } from "./RevealBanner";
import { ErrorBoundary } from "./ErrorBoundary";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
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
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
