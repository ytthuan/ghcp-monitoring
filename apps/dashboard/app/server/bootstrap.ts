/**
 * Idempotent bootstrap for the Copilot dashboard.
 *
 * Bootstrap confirms ClickHouse is reachable, then prepares the dashboard's
 * slim span projection so normal panels do not scan raw SpanAttributes maps.
 */
import { getClient, ping } from "./clickhouse";
import { ensureSpanProjection } from "./queries/span_projection";

let _booted = false;

export async function bootstrap(): Promise<{ ok: boolean; reason?: string }> {
  if (_booted) return { ok: true };
  if (!(await ping())) return { ok: false, reason: "clickhouse unreachable" };
  const ch = getClient();
  // Confirm we can read the database the dashboard expects. otel_traces may
  // not exist yet on a fresh stack — that's fine; routes render empty states.
  try {
    await ch.command({
      query: "SELECT 1 FROM system.databases WHERE name = currentDatabase() LIMIT 1",
    });
  } catch (e) {
    return { ok: false, reason: `clickhouse db check failed: ${(e as Error).message}` };
  }
  try {
    await ensureSpanProjection();
  } catch (e) {
    return { ok: false, reason: `span projection setup failed: ${(e as Error).message}` };
  }
  _booted = true;
  return { ok: true };
}
