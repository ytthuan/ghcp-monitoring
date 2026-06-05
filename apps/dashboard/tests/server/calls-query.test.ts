import { describe, expect, test, vi } from "vitest";

import { FiltersSchema } from "../../app/lib/types";

vi.mock("../../app/server/queries/span_projection", async () => {
  const actual = await vi.importActual<typeof import("../../app/server/queries/span_projection")>(
    "../../app/server/queries/span_projection",
  );
  return {
    ...actual,
    queryDashboardSpans: vi.fn(async (sql: string) => {
      if (sql.includes("count() AS c")) {
        return [{ c: 1 }];
      }
      return [
        {
          trace_id: "trace-1",
          span_id: "span-1",
          call_timestamp: "2026-05-10T10:00:00Z",
          request_model: "gpt-4.1",
          response_model: "gpt-4.1",
          input: 100,
          output: 50,
          cache_read: 25,
          cache_create: 0,
          duration_ms: 1234,
          finish_reasons: "stop",
          agent_name: "fixture-agent",
          conversation_id: "session-1",
          copilot_cost: 7.5,
        },
      ];
    }),
  };
});

function fixtureFilters() {
  return FiltersSchema.parse({
    range: "custom",
    from: "2026-05-10T09:50:00Z",
    to: "2026-05-10T10:30:00Z",
    models: [],
    agents: [],
    granularity: "1h",
  });
}

describe("clickhouse calls query", () => {
  test("keeps the formatted row timestamp alias distinct from the filter column", async () => {
    const { getCalls } = await import("../../app/server/queries/calls");
    const { queryDashboardSpans } = await import("../../app/server/queries/span_projection");
    const querySpans = vi.mocked(queryDashboardSpans);

    const result = await getCalls({
      filters: fixtureFilters(),
      pageIndex: 0,
      pageSize: 20,
      sortBy: "timestamp",
      sortDir: "desc",
    });

    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      timestamp: "2026-05-10T10:00:00Z",
      request_model: "gpt-4.1",
      response_model: "gpt-4.1",
      input: 100,
      output: 50,
      cache_read: 25,
      cache_create: 0,
      duration_ms: 1234,
      finish_reasons: "stop",
      agent_name: "fixture-agent",
      conversation_id: "session-1",
      copilot_cost: 7.5,
    });

    expect(querySpans).toHaveBeenCalledTimes(2);
    const rowSql = String(querySpans.mock.calls[1]?.[0] ?? "");
    expect(rowSql).toContain("formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%SZ') AS call_timestamp");
    expect(rowSql).toContain("copilot_cost                 AS copilot_cost");
    expect(rowSql).not.toContain("AS timestamp");
    expect(rowSql).toContain("WHERE timestamp BETWEEN parseDateTime64BestEffort({from:String}) AND parseDateTime64BestEffort({to:String})");
    expect(rowSql).toContain("ORDER BY timestamp DESC");
  });
});
