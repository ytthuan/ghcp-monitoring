# ADR-0001: OTel Collector as the single telemetry ingress

- Status: accepted
- Date: 2026-05-14
- Owners: `@architecture-reviewer` + `@otel-collector-engineer`

## Context

GitHub Copilot CLI / Chat emits OTLP traces, metrics, and logs (per the
Microsoft monitoring guide and the OpenTelemetry GenAI semantic conventions).
We need a single, vendor-neutral entry point that can:

- Terminate OTLP gRPC (`:4317`) and OTLP HTTP (`:4318`) from local clients.
- Apply attribute scrubbing / redaction once, regardless of downstream.
- Decouple producers from storage so backends can be swapped without
  reconfiguring every client.

Originally, the collector fanned out to two viewer-only sinks (Aspire
Dashboard for traces+logs, Jaeger for traces). Both were in-memory and
neither persisted across restarts. ADR-0005 supersedes that storage
decision in favour of ClickHouse, but the **ingress** decision recorded
here is unchanged.

## Decision

Run a single OpenTelemetry Collector (contrib distribution) as the only
telemetry ingress for the stack:

- Receivers: `otlp` on `0.0.0.0:4317` (gRPC) and `0.0.0.0:4318` (HTTP).
- Processors: `memory_limiter`, `batch`, and the redaction pipeline
  defined in ADR-0003 (`attributes/redact-content`, opt-in).
- Exporters: `clickhouse` (traces, metrics, logs) per ADR-0005, plus a
  `debug`/`metadata` exporter so `docker logs` still proves ingress
  health when no UI is up.

No producer talks to any backend directly. All redaction happens at the
collector edge — never per-backend.

## Consequences

### Positive

- One place to apply sampling, batching, and redaction.
- Backends are swappable (we already swapped Aspire+Jaeger → ClickHouse
  without touching any client config).
- Single health surface for ingress (`scripts/validate.sh connectivity`
  pings the collector and `:4318/v1/traces`).

### Negative / risks

- The collector is a single point of failure for ingest. Acceptable for
  a local-first stack (ADR-0002); revisit if the topology grows.
- Misconfigured processors can silently drop or mangle attributes —
  mitigated by the golden-fixture test required in the Security & Audit
  Matrix.

## Alternatives considered

- **Direct VS Code → backend per signal.** Rejected — couples producers
  to vendors, duplicates redaction, blocks backend swaps.
- **Multiple collectors (one per signal).** Rejected — operationally
  heavier with no benefit at this scale.

## References

- Microsoft monitoring guide — <https://github.com/microsoft/vscode-copilot-chat/blob/main/docs/monitoring/agent_monitoring.md>
- OpenTelemetry GenAI semantic conventions — <https://opentelemetry.io/docs/specs/semconv/gen-ai/>
- ADR-0003 — Attribute redaction strategy
- ADR-0005 — ClickHouse persistence (downstream of this ingress)
