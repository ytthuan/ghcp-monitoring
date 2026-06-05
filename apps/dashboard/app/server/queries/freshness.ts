/**
 * Freshness server-fn: reports the most recent span timestamp ingested by
 * ClickHouse plus a count of spans seen in the last 5 minutes. Used by the
 * header <RefreshControl/> badge so the operator can tell at a glance whether
 * the OTel pipeline is still flowing data into the warehouse.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  DASHBOARD_SPANS_TABLE,
  queryDashboardSpans,
} from "./span_projection";

export type FreshnessStats = {
  /** ISO-8601 (UTC) timestamp of the newest span, or null if the table is empty. */
  lastSpanAt: string | null;
  /** Server-side seconds elapsed since the newest span, or null when no data. */
  secondsSinceLastSpan: number | null;
  /** Count of spans whose Timestamp falls in the last 5 minutes. */
  spansLast5m: number;
  /** Server's "now" (ISO UTC) so the client can show drift vs. local clock. */
  fetchedAt: string;
};

export const getFreshness = createServerFn({ method: "GET" }).handler(
  async (): Promise<FreshnessStats> => {
    const sql = `
      SELECT
        toString(max(timestamp))                          AS lastSpanAt,
        dateDiff('second', max(timestamp), now())         AS secondsSinceLastSpan,
        countIf(timestamp >= now() - INTERVAL 5 MINUTE)   AS spansLast5m,
        toString(now())                                   AS fetchedAt
      FROM ${DASHBOARD_SPANS_TABLE}
    `;
    const rows = await queryDashboardSpans<{
      lastSpanAt: string;
      secondsSinceLastSpan: string | number;
      spansLast5m: string | number;
      fetchedAt: string;
    }>(sql);
    const r = rows[0];
    const fetchedAtIso = r?.fetchedAt
      ? new Date(r.fetchedAt.replace(" ", "T") + "Z").toISOString()
      : new Date().toISOString();

    if (!r || !r.lastSpanAt || r.lastSpanAt.startsWith("1970-01-01")) {
      return {
        lastSpanAt: null,
        secondsSinceLastSpan: null,
        spansLast5m: 0,
        fetchedAt: fetchedAtIso,
      };
    }

    return {
      lastSpanAt: new Date(r.lastSpanAt.replace(" ", "T") + "Z").toISOString(),
      secondsSinceLastSpan: Number(r.secondsSinceLastSpan),
      spansLast5m: Number(r.spansLast5m),
      fetchedAt: fetchedAtIso,
    };
  });
