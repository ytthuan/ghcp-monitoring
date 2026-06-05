# Security Policy

## Supported Versions

`ghcp-monitoring` is an early-stage local-first observability stack. Only the
latest minor release on `main` receives security fixes.

| Version | Supported |
|---|---|
| `0.1.x` | yes |
| `< 0.1` | no |

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Report suspected security issues privately using GitHub's private vulnerability
reporting:

<https://github.com/ytthuan/ghcp-monitoring/security/advisories/new>

If GitHub private advisories are unavailable, email the maintainer at the
address listed on the GitHub profile of the repository owner with the subject
line `[ghcp-monitoring security]`.

We acknowledge receipt within **7 days** and aim to publish a fix or
mitigation within **90 days**, per industry-standard coordinated disclosure.

## In Scope

- Telemetry redaction bypass - anything that causes prompt content, code, file
  paths, credentials, or secrets to be persisted or rendered when
  `COPILOT_OTEL_CAPTURE_CONTENT=false`.
- Container escape or privilege escalation in any service shipped by this
  repo's `docker-compose.yml` (collector, ClickHouse, dashboard).
- Authentication bypass on the dashboard (`<RevealableCell />`, HTTP Basic
  Auth, sessionStorage reveal flag).
- Unintended network exposure when the loopback default is in effect (
  `DASHBOARD_BIND_HOST` / `OTEL_BIND_HOST` regressions).
- Secret leak - anything that causes `.env` values, ClickHouse credentials, or
  GitHub tokens to be logged, exported, or rendered in the UI.
- Supply-chain risk in the pinned images or in `apps/dashboard/package.json`
  that would let an attacker run arbitrary code in the dashboard or collector.

## Out of Scope

- Vulnerabilities in upstream projects we re-package without modification
  (OpenTelemetry Collector Contrib, ClickHouse). Report those upstream and
  open a tracking issue here so we can re-pin once the upstream fix ships.
- Local-attacker scenarios where the threat actor already has shell access to
  the host running `docker compose`.
- Issues that only manifest when the operator has intentionally enabled an
  experimental or off-by-default flag in a way the docs warn against (for
  example, exposing the dashboard on `0.0.0.0` without rotating
  `DASHBOARD_PASSWORD`).

## Hardening Checklist for Operators

Before exposing the stack on anything other than loopback:

1. Rotate `DASHBOARD_PASSWORD` and `CLICKHOUSE_PASSWORD` in `.env`.
2. Keep `COPILOT_OTEL_CAPTURE_CONTENT=false` unless you are in a trusted,
   scoped debugging session - and re-rotate credentials afterwards.
3. Put a TLS-terminating reverse proxy in front of the dashboard.
4. Re-confirm the `<RevealBanner />` is visible when captured content is
   exposed.
5. Re-run `bash scripts/validate.sh all` and `gitleaks detect --no-banner`.

See [`docs/monitoring/README.md`](docs/monitoring/README.md) for the full
runtime threat model and `AGENTS.md` for the Security & Audit Matrix.
