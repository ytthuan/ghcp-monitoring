/**
 * Server-only ClickHouse client. Importing this module from a client component
 * will throw a build-time warning via TanStack Start's createServerFn boundary.
 */
import { createClient, type ClickHouseClient } from "@clickhouse/client";

let _client: ClickHouseClient | null = null;

export function getClient(): ClickHouseClient {
  if (_client) return _client;
  const url = process.env.CLICKHOUSE_URL
    ?? `http://${process.env.CLICKHOUSE_HOST ?? "clickhouse"}:${process.env.CLICKHOUSE_PORT ?? "8123"}`;
  const username = process.env.CLICKHOUSE_USER ?? "default";
  const password = process.env.CLICKHOUSE_PASSWORD ?? "";
  const database = process.env.CLICKHOUSE_DB ?? "copilot_telemetry";
  _client = createClient({
    url,
    username,
    password,
    database,
    request_timeout: 15_000,
    compression: { request: false, response: true },
    application: "ghcp-dashboard",
  });
  return _client;
}

export async function ping(): Promise<boolean> {
  try {
    const r = await getClient().ping();
    return r.success;
  } catch {
    return false;
  }
}

export async function query<T>(
  q: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const rs = await getClient().query({
    query: q,
    query_params: params,
    format: "JSONEachRow",
  });
  return (await rs.json()) as T[];
}

export async function command(
  q: string,
  params: Record<string, unknown> = {},
): Promise<void> {
  await getClient().command({
    query: q,
    query_params: params,
  });
}
