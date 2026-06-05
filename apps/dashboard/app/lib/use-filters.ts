import { useNavigate, useSearch, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import type { Filters } from "./types";

const rootRoute = getRouteApi("__root__");

export function useFilters(): {
  filters: Filters;
  setFilters: (next: Partial<Filters>) => void;
} {
  const search = useSearch({ strict: false }) as Partial<Filters>;
  const config = rootRoute.useLoaderData();
  const navigate = useNavigate();

  const filters: Filters = {
    range: search.range ?? config.defaultRange ?? "7d",
    from: search.from,
    to: search.to,
    models: search.models ?? [],
    agents: search.agents ?? [],
    granularity: search.granularity ?? config.defaultGranularity ?? "1h",
  };

  const setFilters = useCallback(
    (next: Partial<Filters>) => {
      void navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({ ...prev, ...next }),
        replace: true,
      });
    },
    [navigate],
  );

  return { filters, setFilters };
}
