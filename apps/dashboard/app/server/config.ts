import { createServerFn } from "@tanstack/react-start";
import { TimeRange, Granularity } from "~/lib/types";

// "custom" requires from/to; it doesn't make sense as an empty-URL default,
// so we explicitly exclude it from the type of `defaultRange`.
export type DefaultRange = Exclude<TimeRange, "custom">;

export interface DashboardConfig {
  defaultRange: DefaultRange;
  defaultGranularity: Granularity;
}

export const getServerConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardConfig> => {
    const rawRange = process.env.DASHBOARD_DEFAULT_RANGE ?? "7d";
    const rawGran = process.env.DASHBOARD_DEFAULT_GRANULARITY ?? "1h";
    const range = TimeRange.safeParse(rawRange);
    const gran = Granularity.safeParse(rawGran);
    return {
      defaultRange:
        range.success && range.data !== "custom"
          ? (range.data as DefaultRange)
          : "7d",
      defaultGranularity: gran.success ? gran.data : "1h",
    };
  },
);
