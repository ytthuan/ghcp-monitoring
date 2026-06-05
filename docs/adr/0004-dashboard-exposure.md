# ADR-0004: Dashboard and OTel collector exposure

- Status: accepted
- Date: 2026-05-14
- Owners: `@architecture-reviewer` + `@security-auditor` + `@dashboard-engineer` + `@otel-collector-engineer`

## Context

The stack was built local-first. Every host-facing port binds to
loopback only:

- Dashboard → `127.0.0.1:6969`
- OTel Collector → `127.0.0.1:4317` (gRPC), `127.0.0.1:4318` (HTTP),
  `127.0.0.1:13133` (health)
- ClickHouse → `127.0.0.1:8123`

That posture works for a single-machine workflow but blocks two
real, recurring use cases on the user's home LAN:

1. **Viewing the dashboard from another device on the LAN** (phone,
   laptop, second workstation) without an SSH tunnel.
2. **Shipping Copilot CLI / Chat telemetry from another LAN device**
   into this collector, so a single host aggregates multi-device
   GenAI usage.

Both call for opt-in widening of the bind addresses for the
dashboard and the collector — but **not** for ClickHouse, which has
no use case for direct LAN access (the dashboard is its only
intended client).

## Decision

Keep loopback as the **default** posture; allow LAN exposure as an
explicit, per-service opt-in.

- Introduce two env vars consumed by `docker-compose.yml`:
  - `DASHBOARD_BIND_HOST` (default `127.0.0.1`) — the host
    interface the dashboard's `:6969` port binds to.
  - `OTEL_BIND_HOST` (default `127.0.0.1`) — the host interface
    the collector's `:4317`, `:4318`, and `:13133` ports bind to.
  Setting either to `0.0.0.0` (or a specific NIC IP) widens that
  service's reachability to the LAN.
- **ClickHouse stays loopback-only.** No env knob is added; the
  `:8123` host port remains pinned to `127.0.0.1` (and ADR-0005
  still recommends no host port at all once the dashboard moves
  fully onto the docker network).
- **Required when LAN-binding the dashboard:** rotate
  `DASHBOARD_PASSWORD` away from the default `admin` to a 24-char
  random value. `@security-auditor` enforces this in the LAN-exposure
  preflight; `.env.example` documents it.
- **OTel collector OTLP receivers continue to have no application-
  level auth.** The only controls on a LAN-bound collector are:
  - network reachability (operator chose to bind to the LAN), and
  - the always-on `attributes/scrub-auth` processor, which strips
    `Authorization`, `Cookie`, `Set-Cookie`, and `url.full` from
    every signal at the edge (per ADR-0001's edge-only redaction
    pattern).
  This is acceptable for a **trusted home LAN only** and MUST be
  re-evaluated if the deployment ever spans an untrusted network.
- **Defense-in-depth UI signal.** The dashboard renders a
  `<LanBanner/>` component when the request's Host header resolves
  to anything other than loopback, warning the operator that the
  UI is reachable beyond `localhost`.

## Consequences

### Positive

- Operators on the LAN can reach the dashboard with Basic Auth, no
  SSH tunnel required.
- Other devices on the LAN can ship Copilot telemetry to the
  collector, enabling multi-device aggregation on one host.
- Defaults remain secure: a fresh clone with an unset
  `DASHBOARD_BIND_HOST` / `OTEL_BIND_HOST` is identical to the
  loopback-only baseline.
- ClickHouse's blast radius does not change — the database is
  still unreachable from the LAN regardless of the new env vars.

### Negative / risks

- If the user joins an **untrusted** network with
  `DASHBOARD_BIND_HOST=0.0.0.0`, the dashboard becomes reachable to
  anyone on that network. Basic Auth + a strong password is the
  only barrier. The `<LanBanner/>` is a UX hint, not a control.
- A LAN-bound collector accepts unauthenticated OTLP from any LAN
  peer. Edge scrubbing prevents auth-token leakage into ClickHouse,
  but it does **not** prevent a hostile peer from injecting
  fabricated telemetry rows.
- Future work, deferred: optional IP allowlist on the dashboard
  reverse path; mTLS on the OTel receiver; or a Tailscale-style
  mesh that replaces LAN trust with identity.
- The Threat Model row "Dashboards UI" in `AGENTS.md` must be
  amended (by `@orchestrator`, separately) to reflect that
  loopback is now the *default*, not the *only* posture.

## Alternatives considered

- **Keep loopback-only and require an SSH tunnel from each LAN
  device.** Rejected — too fiddly for the user's daily workflow,
  especially from mobile.
- **Stand up a reverse proxy (Caddy / Traefik) with TLS in front
  of the dashboard.** Overkill for v1 on a home LAN; can be added
  later without breaking this ADR (the dashboard would simply bind
  loopback again and the proxy would publish on the LAN).
- **Enable mTLS on the OTel receiver.** Materially better posture
  but adds operational burden (cert distribution to each Copilot
  CLI host); deferred until the threat model justifies it.
- **Tailscale / WireGuard mesh.** Out of scope — the user
  explicitly wants pure local LAN, no third-party identity plane.

## References

- ADR-0001 — OTel Collector as the single telemetry ingress
  (edge-only `attributes/scrub-auth` lives there).
- ADR-0005 — ClickHouse persistence (the service that intentionally
  does **not** get a LAN bind).
- ADR-0006 — TanStack Start dashboard (consumer of
  `DASHBOARD_BIND_HOST`; host of `<LanBanner/>`).
