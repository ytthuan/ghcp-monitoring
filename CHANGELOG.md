# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-05

### Added

- Initial open-source release.
- Docker Compose stack: OpenTelemetry Collector Contrib + ClickHouse.
- TanStack Start dashboard (`apps/dashboard/`) with 13 panels for token usage,
  trends, models, agents, sessions, cache efficiency, latency, time-to-first-token,
  tool calls, hourly heatmap, finish reasons, per-call table, traces, and logs.
- HTTP Basic Auth on the dashboard with a `<RevealableCell />` reveal-on-click
  UX for captured content.
- Loopback-by-default bind (`127.0.0.1:6969`) with opt-in LAN bind via
  `DASHBOARD_BIND_HOST` / `OTEL_BIND_HOST` env vars.
- `scripts/setup-terminal.sh` and `scripts/setup-terminal.ps1` for wiring
  Copilot CLI terminal sessions on Unix-like shells and Windows PowerShell.
- Windows CI coverage for dashboard install, typecheck, lint, unit tests, build,
  and the PowerShell terminal setup helper.
- `scripts/validate.sh` quality gate (compose + yaml + shell + agents + connectivity).
- Bounded retention (`RETENTION_DAYS`, default 90 days) on both the
  ClickHouse OTel exporter and the materialized views.
- Architecture decision records: ADR-0000 -> ADR-0006.

[Unreleased]: https://github.com/ytthuan/ghcp-monitoring/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ytthuan/ghcp-monitoring/releases/tag/v0.1.0
