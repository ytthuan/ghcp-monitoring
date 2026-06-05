/// <reference types="vite/client" />
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { z } from "zod";
import { AppShell } from "~/components/layout/AppShell";
import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import { TimezoneProvider } from "~/lib/use-timezone";
import globalsCss from "~/styles/globals.css?url";
import { FiltersSchema } from "~/lib/types";
import { getServerConfig } from "~/server/config";

const SearchSchema = FiltersSchema.partial();

export const Route = createRootRoute({
  validateSearch: (s: Record<string, unknown>) => SearchSchema.parse(s),
  // Cheap env-var lookup; cache the result so RefreshControl's
  // router.invalidate() doesn't re-execute the loader.
  loader: () => getServerConfig(),
  staleTime: Infinity,
  gcTime: Infinity,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Copilot Telemetry Dashboard" },
    ],
    links: [{ rel: "stylesheet", href: globalsCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Providers>
        <AppShell>
          <Outlet />
        </AppShell>
        <Toaster />
      </Providers>
    </RootDocument>
  );
}

function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={qc}>
        <TimezoneProvider>
          <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
        </TimezoneProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Re-export schema piece so other routes can use the same shape.
export type { z };
