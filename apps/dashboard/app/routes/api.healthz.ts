import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createElement } from "react";

const checkHealth = createServerFn({ method: "GET" }).handler(async () => {
  const { ping } = await import("~/server/clickhouse");
  const ok = await ping();
  return { ok, clickhouse: ok ? "reachable" : "unreachable" };
});

export const Route = createFileRoute("/api/healthz")({
  loader: () => checkHealth(),
  component: HealthzView,
});

function HealthzView() {
  const data = Route.useLoaderData();
  return createElement(
    "pre",
    { className: "m-4 rounded bg-muted p-4 font-mono text-xs" },
    JSON.stringify(data, null, 2),
  );
}
