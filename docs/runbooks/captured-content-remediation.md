# Captured Content Remediation

> Status: **active incident playbook**.
> Triggered when raw Copilot prompt / completion / tool-call content is found
> at rest in ClickHouse (`copilot_telemetry.*`).

## 1. Severity & scope

- **Severity:** **High**. Any row with content is presumed to contain user
  source code, file paths, and — as observed at least once — verbatim secrets
  pasted into chat (PATs, API keys, etc.).
- **Current finding (as of this runbook's creation):**
  ```
  SELECT countIf(SpanAttributes['gen_ai.input.messages'] != ''
                OR SpanAttributes['copilot_chat.user_request'] != '') AS rows_with_content,
         count() AS total
  FROM copilot_telemetry.otel_traces;
  -- → 194 / 3826 rows carried full prompt content
  ```
  At least one row contained a real GitHub Personal Access Token in
  `SpanAttributes['copilot_chat.user_request']`.
- **Why this is in scope of this repo:** see ADR-0003 *Sensitive-content
  handling* (attribute redaction processor + dashboard reveal-on-click) and
  the threat-model row "Telemetry payload (spans, metrics, logs)" in
  `AGENTS.md`. Default posture is `COPILOT_OTEL_CAPTURE_CONTENT=false`
  (`.env.example`); when it is flipped on, prompt content lands in
  ClickHouse and is rendered through `<RevealableCell />` /
  `<LogBodyCell />`, which redact in the **UI** but cannot redact what is
  already on disk.

## 2. Step 1 — Rotate the leaked credential (do this first)

1. Revoke the leaked GitHub Personal Access Token at
   <https://github.com/settings/tokens>. Create a new one with the minimum
   scopes you actually need.
2. Treat **any other secret** you may have pasted into Copilot Chat — or
   committed into a tracked file (`.env`, `config/**.yaml`, application
   secrets) — as exposed and rotate them as well: API keys, OAuth client
   secrets, database passwords, signing keys, webhook secrets.
3. If the token had write scopes, audit recent activity on affected
   repos / packages before moving on.

> Do **not** copy the leaked secret value out of the database to "look at
> it". The scrub script in step 3 removes it without you having to read it.

## 3. Step 2 — Disable content capture

1. Edit the repo-root `.env`:
   ```sh
   COPILOT_OTEL_CAPTURE_CONTENT=false
   ```
2. Restart the OTel collector so the change is picked up by the VS Code /
   Copilot CLI clients reading the env (and to bounce any in-process
   exporters):
   ```sh
   docker compose restart otel-collector
   ```
   (Service name confirmed in `docker-compose.yml` → `services.otel-collector`.)
3. Verify the setting is off:
   ```sh
   grep ^COPILOT_OTEL_CAPTURE_CONTENT .env
   ```

New telemetry from this point on will not carry prompt / completion bodies.
The historical rows still need to be scrubbed — continue to step 3.

## 4. Step 3 — Scrub stored prompts

The script `scripts/scrub-captured-content.sh` removes the seven sensitive
attribute keys in place using `ALTER TABLE ... UPDATE mapFilter(...)`. It
preserves all non-sensitive observability columns.

### 4.1 Dry-run (always first)

```sh
bash scripts/scrub-captured-content.sh
```

This prints, per table, how many rows currently carry each sensitive key and
the exact `ALTER` statements it would run. It does **not** mutate anything.

Eyeball the per-key counts. Confirm they look like the order of magnitude
you expect.

### 4.2 Apply

```sh
bash scripts/scrub-captured-content.sh --apply
```

If your ClickHouse is reachable on `127.0.0.1:8123` (the loopback bind set
in `docker-compose.yml`), the script can talk to it directly via HTTP using
the credentials in `.env`. If you have removed that host port and want to
go through the container instead:

```sh
docker compose exec -T clickhouse \
  env CLICKHOUSE_HTTP_URL=http://127.0.0.1:8123 \
      CLICKHOUSE_USER="$CLICKHOUSE_USER" \
      CLICKHOUSE_PASSWORD="$CLICKHOUSE_PASSWORD" \
      CLICKHOUSE_DATABASE="$CLICKHOUSE_DB" \
      bash < scripts/scrub-captured-content.sh -- --apply
```

`ALTER ... UPDATE` is asynchronous in MergeTree. The script polls
`system.mutations` for up to ~120s waiting for `is_done = 1` before
reporting the post-condition counts.

## 5. Step 4 — Verify

Re-run the original count query — it should now return zero:

```sh
docker compose exec -T clickhouse clickhouse-client --query "
  SELECT countIf(SpanAttributes['gen_ai.input.messages'] != ''
                OR SpanAttributes['copilot_chat.user_request'] != '') AS rows_with_content,
         count() AS total
  FROM copilot_telemetry.otel_traces;"
```

Expected: `rows_with_content = 0`, `total` unchanged.

The script also prints its own post-condition counts at the end of an
`--apply` run; they should both be `0`.

## 6. What the scrub does NOT do

- It does **not** delete spans, logs, or metric rows. Trace IDs,
  timestamps, durations, service names, model names, prompt/completion
  **token counts**, finish reasons, status codes — all retained. Latency
  and cost dashboards continue to work.
- It does **not** touch `ResourceAttributes` or `ScopeAttributes` (those
  carry collector / SDK identity, not request bodies).
- It does **not** rewrite ClickHouse backups, S3 / object-storage
  snapshots, or any external exporter sink. If you have configured an
  additional OTel exporter destination, scrub or rotate that store
  separately.
- It does **not** rotate the leaked credential — that is step 1, and it is
  the only step that closes the actual security window.

## 7. Operational note (defense-in-depth)

The dashboard already redacts these attributes by default in the UI:
`isSensitiveAttr()` and `shouldRedactLogBody()` (see
`apps/dashboard/app/components/data/`). Values are only revealed after an
explicit click on `<RevealableCell />` and the reveal flag lives in
`sessionStorage` only.

This scrub is **defense-in-depth at rest**: the raw rows can still be
exported via direct SQL (`clickhouse-client`, HTTP `/?query=`,
`docker compose exec clickhouse ...`), and the UI redaction does not help
you there. After running this scrub, the values are gone from the
underlying parts and no SQL path can resurrect them.

## 8. Related

- ADR-0003 — Sensitive-content handling (redaction strategy).
- ADR-0006 — TanStack dashboard (reveal-on-click UX).
- `AGENTS.md` → Security & Audit Matrix → row "Capture-content opt-out by
  default" and threat-model row "Telemetry payload (spans, metrics, logs)".
- `.env.example` → `COPILOT_OTEL_CAPTURE_CONTENT` (must remain `false` by
  default).
