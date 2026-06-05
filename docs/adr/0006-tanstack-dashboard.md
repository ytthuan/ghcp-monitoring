# ADR-0006: TanStack Start dashboard as the primary visualization layer

- Status: accepted
- Date: 2026-05-14
- Owners: `@architecture-reviewer` + `@typescript-implementer` + `@dashboard-engineer`

## Context

Aspire Dashboard, the previous primary UI, runs on Microsoft's stack and
is intentionally generic. It cannot:

- Show a **per-call** sortable, filterable table (only percentile
  histograms).
- Provide shareable URLs that capture filter state.
- Render custom panels for **cache efficiency**, **estimated cost**,
  or **session timelines**.
- Offer a controllable theme or design system aligned with the team's
  modern frontend conventions.

Jaeger overlapped Aspire's trace view and added no per-call analytics.
Both being in-memory, they were superseded as the storage layer by
ADR-0005. That ADR also clears the way to choose a UI on its own merits.

## Decision

Build a custom dashboard at `apps/dashboard/` using **TanStack Start**
(latest `~1.167.x`, React 19 + SSR + server functions) with:

- **TanStack Router** for type-safe routing and search-param state.
- **TanStack Query** for client cache + revalidation.
- **TanStack Table** for the per-call grid (sort, filter, paginate).
- **shadcn/ui charts** (Recharts under the hood) for visualizations.
- **Tailwind v4** (CSS-first config) for styling.
- **`@clickhouse/client`** inside server functions only — no SQL or
  credentials reach the browser bundle.

Surface = 13 panels on `:6969`:

| Route | Panel |
|---|---|
| `/` | Totals (KPI cards) |
| `/trends` | Stacked area trend (5m/1h/1d) |
| `/models` | By model (request vs response, share of spend) |
| `/agents` | By agent |
| `/calls` | Per-call sortable table |
| `/sessions`, `/sessions/$id` | Session list + turn-by-turn detail |
| `/cache` | Cache efficiency + savings $ |
| `/latency` | Per-model duration histogram + p50/p90/p99 |
| `/ttft` | Time-to-first-token distribution |
| `/tools` | Tool-call frequency, duration, failure rate |
| `/heatmap` | DOW × HOD heatmap |
| `/finish` | Finish-reason breakdown |

Filter bar (date range, model, agent) is global and serialized into
URL search params, so any view is shareable.

**Captured-content safety.** Server functions return content in two
shapes: `redacted` (default) and `revealed` (per-row, opt-in click).
Reveal sets a `sessionStorage`-only flag and triggers a persistent
banner above the table. The collector-side
`attributes/redact-content` processor (ADR-0003) remains opt-in and
disabled by default — matching current behavior.

**Runtime topology.** Dashboard ships as a multi-stage Node 22
container, non-root, `read_only: true`, `cap_drop: [ALL]`,
`no-new-privileges:true`, bound to **`127.0.0.1:6969`** (preserves
ADR-0004). `pnpm dev` is supported for local iteration via
`scripts/dashboard-dev.sh`.

**Aspire and Jaeger services are removed from `docker-compose.yml`.**

## Consequences

### Positive

- Full control over UX: per-call table, cost panel, session timeline,
  cache view, and shareable URLs — none of which Aspire offered.
- Server-only SQL keeps credentials and the ClickHouse client off the
  wire to the browser.
- Aligns with the team's modern TS stack and the existing TS
  implementer ownership (`apps/ts/**` per Directory Architecture).
- Loopback bind + container hardening preserves the security baseline
  established for prior services.

### Negative / risks

- TanStack Start is young (`~1.167` at decision time); APIs may shift.
  Mitigations: pin `pnpm-lock.yaml`, smoke-test the production build
  in the Dockerfile, and keep a documented contingency to fall back to
  a Vite SPA + Router/Query if Start blocks.
- One additional service to maintain in compose alongside ClickHouse.
- Aspire's logs / structured-events tab is no longer present; we
  replicate it by querying `otel_logs` directly from a future panel.
- Custom UI = custom maintenance burden; a generic Grafana dashboard
  would have been "free" but does not satisfy the panel/UX brief.
- Captured content is rendered (behind a reveal toggle) in a path
  that did not previously render it. Mitigated by default-redacted UI,
  per-row opt-in, persistent banner, and `sessionStorage`-only flag.

## Alternatives considered

- **Grafana with the official ClickHouse plugin.** Rejected — capable
  and "free" but generic; the team explicitly asked for TanStack +
  shadcn, and Grafana cannot easily host the per-call table or the
  cost panel without heavy plugin work.
- **Vite SPA + TanStack Router/Query.** Kept as a documented
  contingency if TanStack Start hits a blocker; not chosen first
  because we lose SSR + server functions, which we want for the
  ClickHouse client confinement.
- **Keep Aspire as the primary UI.** Rejected — see Context; the
  panel brief cannot be satisfied within Aspire.

## References

- Plan — `plan.md` § "Dashboard surface (13 routes)" and § "Captured-content safety"
- ADR-0001 — OTel Collector as single ingress
- ADR-0004 — Dashboard exposure (loopback-only)
- ADR-0005 — ClickHouse persistence (data source)
- TanStack Start — <https://tanstack.com/start>
- shadcn/ui charts — <https://ui.shadcn.com/charts>
