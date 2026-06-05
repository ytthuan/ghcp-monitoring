import { command, query } from "../clickhouse";

export const DASHBOARD_SPANS_TABLE = "ghcp_dashboard_spans";
const DASHBOARD_SPANS_MV = "ghcp_dashboard_spans_mv";
const RAW_TRACES_TABLE = "otel_traces";
const BACKFILL_CHUNK_HOURS = 6;

export const CHAT_SPAN_SQL = "startsWith(span_name, 'chat')";
export const TOOL_SPAN_SQL =
  "(tool_name != '' OR startsWith(span_name, 'execute_tool '))";

let ready = false;
let ensureInFlight: Promise<void> | null = null;

function retentionDays(): number {
  const parsed = Number(process.env.RETENTION_DAYS ?? "90");
  if (!Number.isFinite(parsed) || parsed < 1) return 90;
  return Math.floor(parsed);
}

function chDateToIso(value: string | null | undefined): string | null {
  if (!value || value.startsWith("1970-01-01")) return null;
  return new Date(value.replace(" ", "T") + "Z").toISOString();
}

function timingMsExpr(key: string): string {
  return `
    if(
      isNull(toFloat64OrNull(nullIf(SpanAttributes['${key}'], ''))),
      CAST(NULL, 'Nullable(Float64)'),
      if(
        assumeNotNull(toFloat64OrNull(nullIf(SpanAttributes['${key}'], ''))) > 30,
        assumeNotNull(toFloat64OrNull(nullIf(SpanAttributes['${key}'], ''))),
        assumeNotNull(toFloat64OrNull(nullIf(SpanAttributes['${key}'], ''))) * 1000
      )
    )
  `;
}

function projectionSelect(where = ""): string {
  return `
    SELECT
      Timestamp AS timestamp,
      TraceId AS trace_id,
      SpanId AS span_id,
      ParentSpanId AS parent_span_id,
      SpanName AS span_name,
      ServiceName AS service_name,
      SpanKind AS span_kind,
      StatusCode AS status_code,
      StatusMessage AS status_message,
      toUInt64(Duration) AS duration_ns,
      SpanAttributes['gen_ai.request.model'] AS request_model,
      SpanAttributes['gen_ai.response.model'] AS response_model,
      toUInt64OrZero(SpanAttributes['gen_ai.usage.input_tokens']) AS input_tokens,
      toUInt64OrZero(SpanAttributes['gen_ai.usage.output_tokens']) AS output_tokens,
      toUInt64OrZero(SpanAttributes['gen_ai.usage.cache_read.input_tokens']) AS cache_read_tokens,
      toUInt64OrZero(SpanAttributes['gen_ai.usage.cache_creation.input_tokens']) AS cache_create_tokens,
      toUInt64OrZero(SpanAttributes['gen_ai.usage.reasoning.output_tokens']) AS reasoning_output_tokens,
      SpanAttributes['gen_ai.response.finish_reasons'] AS finish_reasons,
      SpanAttributes['gen_ai.agent.name'] AS agent_name,
      SpanAttributes['copilot_chat.chat_session_id'] AS session_id,
      coalesce(
        nullIf(SpanAttributes['gen_ai.tool.name'], ''),
        nullIf(replaceRegexpOne(SpanName, '^execute_tool ', ''), SpanName),
        ''
      ) AS tool_name,
      ${timingMsExpr("copilot_chat.time_to_first_token")} AS ttft_ms,
      ${timingMsExpr("github.copilot.time_to_first_chunk")} AS first_chunk_ms,
      -- GitHub premium-request billing cost (AI Credits). May be absent on
      -- some spans, so keep a presence flag to report coverage honestly.
      toFloat64OrZero(SpanAttributes['github.copilot.cost']) AS copilot_cost,
      toUInt8(SpanAttributes['github.copilot.cost'] != '') AS copilot_cost_present
    FROM ${RAW_TRACES_TABLE}
    ${where}
  `;
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await query<{ exists: string | number }>(
    "SELECT count() AS exists FROM system.tables WHERE database = currentDatabase() AND name = {table:String}",
    { table },
  );
  return Number(rows[0]?.exists ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await query<{ c: string | number }>(
    "SELECT count() AS c FROM system.columns WHERE database = currentDatabase() AND table = {table:String} AND name = {column:String}",
    { table, column },
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function createProjectionTable(): Promise<void> {
  const ttlDays = retentionDays();
  await command(`
    CREATE TABLE IF NOT EXISTS ${DASHBOARD_SPANS_TABLE}
    (
      timestamp DateTime64(9, 'UTC'),
      trace_id String,
      span_id String,
      parent_span_id String,
      span_name LowCardinality(String),
      service_name LowCardinality(String),
      span_kind LowCardinality(String),
      status_code LowCardinality(String),
      status_message String,
      duration_ns UInt64,
      request_model String,
      response_model String,
      input_tokens UInt64,
      output_tokens UInt64,
      cache_read_tokens UInt64,
      cache_create_tokens UInt64,
      reasoning_output_tokens UInt64,
      finish_reasons String,
      agent_name String,
      session_id String,
      tool_name String,
      ttft_ms Nullable(Float64),
      first_chunk_ms Nullable(Float64),
      copilot_cost Float64,
      copilot_cost_present UInt8
    )
    ENGINE = MergeTree
    PARTITION BY toYYYYMM(timestamp)
    ORDER BY (timestamp, trace_id, span_id)
    TTL timestamp + INTERVAL ${ttlDays} DAY
  `);
}

async function createProjectionView(): Promise<void> {
  await command(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS ${DASHBOARD_SPANS_MV}
    TO ${DASHBOARD_SPANS_TABLE}
    AS
    ${projectionSelect()}
  `);
}

async function backfillProjection(): Promise<void> {
  const counts = await query<{
    source_rows: string | number;
    projected_rows: string | number;
    min_ts: string;
    max_ts: string;
  }>(`
    SELECT
      (SELECT count() FROM ${RAW_TRACES_TABLE}) AS source_rows,
      (SELECT count() FROM ${DASHBOARD_SPANS_TABLE}) AS projected_rows,
      toString((SELECT min(Timestamp) FROM ${RAW_TRACES_TABLE})) AS min_ts,
      toString((SELECT max(Timestamp) FROM ${RAW_TRACES_TABLE})) AS max_ts
  `);
  const meta = counts[0];
  if (!meta || Number(meta.projected_rows ?? 0) >= Number(meta.source_rows ?? 0)) {
    return;
  }

  const minIso = chDateToIso(meta.min_ts);
  const maxIso = chDateToIso(meta.max_ts);
  if (!minIso || !maxIso) return;

  let cursor = new Date(minIso);
  const end = new Date(maxIso);
  while (cursor <= end) {
    const next = new Date(
      Math.min(
        cursor.getTime() + BACKFILL_CHUNK_HOURS * 60 * 60 * 1000,
        end.getTime() + 1,
      ),
    );
    await command(
      `
      INSERT INTO ${DASHBOARD_SPANS_TABLE}
      ${projectionSelect(`
        WHERE Timestamp >= parseDateTime64BestEffort({from:String})
          AND Timestamp < parseDateTime64BestEffort({to:String})
          AND (TraceId, SpanId) NOT IN (
            SELECT trace_id, span_id FROM ${DASHBOARD_SPANS_TABLE}
            WHERE timestamp >= parseDateTime64BestEffort({from:String})
              AND timestamp < parseDateTime64BestEffort({to:String})
          )
      `)}
      SETTINGS max_threads = 1, max_block_size = 32
    `,
      { from: cursor.toISOString(), to: next.toISOString() },
    );
    cursor = next;
  }
}

export async function ensureSpanProjection(): Promise<void> {
  if (ready) return;
  if (ensureInFlight) return ensureInFlight;

  ensureInFlight = (async () => {
    // Schema migration: if the projection predates the copilot_cost column,
    // rebuild it from scratch. otel_traces is the complete source (same 90d
    // TTL + identical min timestamp), so the drop+rebuild loses no data and
    // backfills copilot_cost for every historical row. Dropping the MV and
    // table together avoids a stale MV definition.
    if (
      (await tableExists(DASHBOARD_SPANS_TABLE)) &&
      !(await columnExists(DASHBOARD_SPANS_TABLE, "copilot_cost"))
    ) {
      await command(`DROP VIEW IF EXISTS ${DASHBOARD_SPANS_MV}`);
      await command(`DROP TABLE IF EXISTS ${DASHBOARD_SPANS_TABLE}`);
    }
    await createProjectionTable();
    if (!(await tableExists(RAW_TRACES_TABLE))) return;
    await createProjectionView();
    await backfillProjection();
    ready = true;
  })().finally(() => {
    ensureInFlight = null;
  });

  return ensureInFlight;
}

export async function queryDashboardSpans<T>(
  q: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  await ensureSpanProjection();
  return query<T>(q, params);
}
