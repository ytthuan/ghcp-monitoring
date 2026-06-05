# ghcp-monitoring

> Agents guide — see <https://agents.md/> for the spec. This file is the canonical agent project memory for **GitHub Copilot CLI**.

<!-- agents-system-setup:managed:start -->

## Project Snapshot

- **Purpose:** Containerized OpenTelemetry observability stack for monitoring **GitHub Copilot CLI + Chat** usage (traces, metrics, logs) per the [Microsoft monitoring guide](https://github.com/microsoft/vscode-copilot-chat/blob/main/docs/monitoring/agent_monitoring.md).
- **Type:** Infrastructure / DevOps (containers + light TypeScript app code)
- **Languages:** TypeScript, Bash, YAML, Markdown
- **Frameworks:** OpenTelemetry Collector, Docker Compose, ClickHouse (persistent OLAP), TanStack Start + shadcn/ui dashboard (`apps/dashboard/`)
- **Tests:** Vitest unit tests live in `apps/dashboard/tests/`; Playwright e2e in `apps/dashboard/e2e/`. CI runs the Vitest suite.
- **Deployment:** Local machine, fully containerized
- **Target platforms:** copilot-cli
- **Output profile:** balanced
- **Agent artifact tracking:** `AGENTS.md` is git-tracked; `.github/agents/**` and `.github/skills/**` remain local-only via `.git/info/exclude`.

## Read First

1. Route by [Directory Architecture](#directory-architecture) and [Agent Roster](#agent-roster).
2. Check [Security & Audit Matrix](#security--audit-matrix) and [Quality Gates](#quality-gates) before risky writes.
3. Load overflow details only when the task needs them — see [Context Loading Policy](#context-loading-policy).
4. Respect artifact tracking: `.github/agents/` and `.github/skills/` stay local-only. Do not move them into git without re-running the tracking decision.

## How Agents Should Work Here

This repo uses an **orchestrator + subagent** model. The orchestrator (`@orchestrator`) decomposes work and delegates to specialized subagents. Skills package reusable workflows. **Every agent MUST read the [Directory Architecture](#directory-architecture) before any edit.**

### Golden Rules

1. **Plan first.** For any non-trivial task, the orchestrator writes a plan and confirms scope before editing.
2. **One concern per subagent.** An implementer never reviews its own work — delegate to `@reviewer`.
3. **Respect Directory Architecture.** Each subagent owns specific paths; do not touch paths owned by another agent without delegation.
4. **Run the project's own checks** before declaring done — see [Build / Test / Lint](#build--test--lint).
5. **Non-destructive edits** to managed files. Touch only what the task requires.
6. **No secrets in code.** Use `.env` files (untracked) and `${ENV_VAR}` references in compose. `.env.example` holds placeholders only.
7. **Telemetry-content opt-out by default.** `COPILOT_OTEL_CAPTURE_CONTENT` defaults to `false`. Enable only with the user's explicit, scoped consent.
8. **Security and architecture are first-class.** Before risky writes, check the Security & Audit Matrix, Threat Model, Architecture Decisions, and Quality Gates below.

## Context Loading Policy

- **Profile:** balanced.
- **Read first (always inline here):** Project Snapshot, Golden Rules, Directory Architecture, Agent Roster, Capability Matrix, Wave Plan, Security & Audit Matrix, Threat Model summary, Architecture & Design Pattern Decisions, ADR Index, Quality Gates, Skills index.
- **Load on demand:** ADR full text in `docs/adr/`, the Microsoft monitoring guide, OTel GenAI semantic conventions, vendor docs for any specific backend.
- **Overflow detail references:**
  - Microsoft Copilot Chat monitoring guide — <https://github.com/microsoft/vscode-copilot-chat/blob/main/docs/monitoring/agent_monitoring.md>
  - OpenTelemetry GenAI semantic conventions — <https://opentelemetry.io/docs/specs/semconv/gen-ai/>
  - ClickHouse OTel exporter — <https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/clickhouseexporter>
  - TanStack Start — <https://tanstack.com/start/latest>
  - shadcn/ui charts — <https://ui.shadcn.com/charts>
  - CIS Docker Benchmark — <https://www.cisecurity.org/benchmark/docker>
  - OWASP secrets-management cheat sheet — <https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html>
  - ADRs — `docs/adr/*.md`
- **Rule:** keep routing and gates inline; if a long detail is moved out of this file, link it here so agents can find it.

## Directory Architecture

> **Read this before editing.** Every subagent has a defined ownership zone. Editing outside your zone requires delegating to the owning agent via the orchestrator.

| Path (glob) | Purpose | Owner agent | Edit rule |
|---|---|---|---|
| `AGENTS.md` | Agent project memory (tracked) | `@orchestrator` | owned |
| `.github/agents/**` | Agent definitions (local-only) | `@orchestrator` | owned |
| `.github/skills/**` | Skill packages (local-only) | `@orchestrator` | additive-only |
| `.github/workflows/**` | CI workflows (tracked) | `@compose-engineer` + `@security-auditor` | shared |
| `.github/ISSUE_TEMPLATE/**`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/dependabot.yml` | Repo contribution UX (tracked) | `@docs-writer` | owned |
| `plan.md`, `**/plan.md` | Active task plans | `@planner` | owned |
| `otel/**`, `config/otelcol-*.yaml` | OTel collector pipelines (receivers, processors, exporters, sampling, redaction) | `@otel-collector-engineer` | owned |
| `docker-compose*.yml`, `Dockerfile*`, `.env.example` | Container orchestration, networks, volumes, env wiring | `@compose-engineer` | owned |
| `config/clickhouse-*.xml`, `scripts/*.sh` | Local stack service configs and Bash operations scripts | `@compose-engineer` | owned |
| `apps/dashboard/**`, `package.json`, `tsconfig.json`, `pnpm-lock.yaml` | TanStack Start dashboard, Vitest unit suite, Playwright e2e | `@typescript-implementer` | owned |
| `README.md`, `docs/**` (excluding `docs/adr/**`) | Project docs, runbooks | `@docs-writer` | owned |
| `docs/adr/**` | Architecture decision records | `@architecture-reviewer` | additive-only |
| `tests/**`, `**/*.test.*`, `**/*.spec.*` | Tests | `@tester` | owned |
| `.env*` (real values; `.env.example` excluded — owned by `@compose-engineer`) | Local secrets | `@security-auditor` | read-only |
| Dependency manifests + lockfiles (`package.json`, `*-lock.*`) | Supply-chain inventory | `@security-auditor` + language owner | shared |
| `dist/`, `build/`, `.output/`, `node_modules/`, `clickhouse-data/` (named docker volumes) | Build / runtime output | (none) | read-only |
| `.mcp.json` | MCP server config | `@orchestrator` | **n/a — MCP disabled per Phase 1.8 intake** |

**Edit rule legend:**

- `read-only` — agent may read for context, must never write.
- `owned` — agent is the sole writer; others must delegate.
- `additive-only` — agent may append/create but not modify existing entries.
- `shared` — multiple owners; coordinate via orchestrator before edits.

## Agent Roster

| Name | Role | Owns | Triggers | Parallel-safe | Wave |
|---|---|---|---|---|---|
| `orchestrator` | Routing & fan-out; never edits code directly | (none) | every non-trivial task | n/a | n/a |
| `planner` | Decompose tasks, write `plan.md` | `plan.md`, `**/plan.md` | new feature, refactor, spike | single in wave | 1 |
| `otel-collector-engineer` | OTel pipelines, sampling, attribute scrubbing | `otel/**`, `config/otelcol-*.yaml` | telemetry pipeline edits | ✅ | 2 |
| `compose-engineer` | Docker compose, Dockerfiles, env wiring | `docker-compose*.yml`, `Dockerfile*`, `.env.example`, `scripts/**` | container/service edits | ✅ | 2 |
| `typescript-implementer` | TanStack Start dashboard (`apps/dashboard/**`) | `apps/dashboard/**`, root TS configs | dashboard code edits | ✅ | 2 |
| `docs-writer` | Project docs (non-ADR) and repo contribution UX | `README.md`, `docs/**`, `.github/ISSUE_TEMPLATE/**`, `.github/PULL_REQUEST_TEMPLATE.md` | doc edits | ✅ | 2 |
| `reviewer` | Read-only diff critique | (none) | post-implementation, pre-merge | ✅ | 3 |
| `security-auditor` | Secrets, hardening, span scrubbing, supply chain | (read-only by default) | sensitive paths touched | ✅ | 3 |
| `architecture-reviewer` | Boundaries, ADRs, observability patterns | `docs/adr/**` | architecture-affecting edits | ✅ | 3 |
| `tester` | Vitest unit + Playwright e2e | `tests/**`, `apps/dashboard/tests/**`, `apps/dashboard/e2e/**`, `**/*.test.*`, `**/*.spec.*` | tests touched | ✅ | 3 |

> The **Model** column is intentionally blank — all agents inherit the platform default. Add a per-agent override only when needed.

## Wave Plan

The orchestrator MUST invoke all parallel-safe subagents of a wave in a **single response** (multiple Task-tool calls in parallel) and await all results before starting the next wave.

- **Wave 1** → `planner`
- **Wave 2** (parallel) → `otel-collector-engineer` ‖ `compose-engineer` ‖ `typescript-implementer` ‖ `docs-writer`
- **Wave 3** (parallel) → `reviewer` ‖ `security-auditor` ‖ `architecture-reviewer` ‖ `tester`

Sequential is the default ONLY when (a) owned-paths overlap, (b) one agent's input is another's output, or (c) shared-state files (`AGENTS.md`, `docs/adr/**`, `CHANGELOG.md`) are touched.

## Capability × Agent Matrix

Legend: ✅ primary owner · 🟡 assists · *(blank)* not involved.

| Capability ↓ / Agent → | orch | plan | otel | compose | ts | docs | rev | sec | arch | test |
|---|---|---|---|---|---|---|---|---|---|---|
| Routing / fan-out | ✅ | | | | | | | | | |
| Plan / decompose | 🟡 | ✅ | | | | | | | | |
| OTel pipelines | | | ✅ | | | | | | | |
| Containers / compose | | | | ✅ | | | | | | |
| TypeScript / dashboard | | | | | ✅ | | | | | |
| Docs (non-ADR) | | | | | | ✅ | | | | |
| Diff review | | | | | | | ✅ | 🟡 | 🟡 | |
| Security audit / hardening | | | | 🟡 | 🟡 | | 🟡 | ✅ | | |
| Architecture / ADRs | | | 🟡 | 🟡 | 🟡 | | 🟡 | | ✅ | |
| Test scaffolding & runs | | | | | 🟡 | | | | | ✅ |

## Security & Audit Matrix

| Risk / control | Owner agent | Applies to paths | Evidence required | Source |
|---|---|---|---|---|
| Capture-content opt-out by default | `@otel-collector-engineer` | `.env.example`, `docker-compose*.yml`, OTel pipeline configs | `COPILOT_OTEL_CAPTURE_CONTENT=false` documented and enforced; opt-in is per-backend, not global | [MS monitoring guide](https://github.com/microsoft/vscode-copilot-chat/blob/main/docs/monitoring/agent_monitoring.md) |
| Span attribute scrubbing (PII / secrets in prompts) | `@otel-collector-engineer` + `@security-auditor` | `otel/**` processor configs | Auth headers always stripped; if capture is enabled, ensure additional content redaction is wired before merge | OTel attributes processor |
| Container hardening | `@compose-engineer` + `@security-auditor` | `Dockerfile*`, `docker-compose*.yml` | Non-root user, no `--privileged`, no docker-socket mount, dropped capabilities, pinned image digests | [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker) |
| No secrets in repo / compose | `@security-auditor` | `docker-compose*.yml`, `.env*`, all tracked files | `gitleaks detect` clean; only `${ENV}` references in compose; `.env` untracked | [OWASP secrets management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) |
| Bounded retention | `@otel-collector-engineer` + `@compose-engineer` | ClickHouse exporter `ttl`, named docker volumes | Explicit retention TTL set (`RETENTION_DAYS` in `.env`, default 90d); volume cap documented | n/a |
| Dashboard auth + loopback bind | `@typescript-implementer` + `@security-auditor` | `apps/dashboard/**`, compose port maps | Dashboard binds `${DASHBOARD_BIND_HOST:-127.0.0.1}:${DASHBOARD_PORT:-6969}` (loopback default; opt-in LAN bind via `.env` per ADR-0004); HTTP Basic Auth always-on (default `admin/admin` for loopback dev only — **rotate `DASHBOARD_PASSWORD` before LAN bind**); `<RevealableCell />` defaults to `[redacted]` placeholder; `<RevealBanner />` warns when content is exposed; `sessionStorage`-only reveal flag (never localStorage). | [OWASP secure defaults](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Cookie_Cheat_Sheet.html) |
| Supply-chain pin | `@security-auditor` + lang owners | manifests + lockfiles | Lockfiles present and pinned; `npm audit` no HIGH+ | [SLSA L1](https://slsa.dev/spec/v1.1/) |
| ADR for major decisions | `@architecture-reviewer` | `docs/adr/**` | One ADR per major decision (collector backend, storage, dashboard, auth) | n/a |
| Diff summary on every change | `@reviewer` | n/a | Diff summary in agent output contract | n/a |
| Workflow trust | `@security-auditor` | `.github/workflows/**` | Pinned action SHAs; least-privilege `permissions:` block; no `pull_request_target` without review | [GitHub Actions hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions) |

## Threat Model

| Asset | Trust boundary | Threat | Mitigation | Owner | Status |
|---|---|---|---|---|---|
| Telemetry payload (spans, metrics, logs) | VS Code / Copilot CLI → OTel collector via OTLP | Sensitive content (prompts, code, paths, secrets) leaks downstream when `captureContent` is on | `captureContent` off by default; auth-header scrubbing at collector; per-backend allow-listed exporters | `@otel-collector-engineer` + `@security-auditor` | implemented (auth-header stripping); content-redaction processor still opt-in |
| Container runtime | Host docker daemon | Privileged escape, socket abuse | No `--privileged`; no `/var/run/docker.sock` mount; drop capabilities; non-root user | `@compose-engineer` + `@security-auditor` | implemented |
| Backend storage volumes | Container ↔ host volume | Unbounded retention fills disk; data lingers indefinitely | TTL retention via `RETENTION_DAYS` (`.env`, default 90d) on collector exporter; named volume `clickhouse-data` (OS-level disk monitoring) | `@otel-collector-engineer` + `@compose-engineer` | implemented |
| Dashboard UI | Host network | Anyone on host (or LAN, when LAN-bound) can read sensitive dashboards | Loopback-by-default bind (`${DASHBOARD_BIND_HOST:-127.0.0.1}:6969`); LAN bind is opt-in via env per ADR-0004 and **requires non-default `DASHBOARD_PASSWORD`**; HTTP Basic Auth always-on; captured content rendered behind `<RevealableCell />` click + `<RevealBanner />` warning + sessionStorage-only flag | `@typescript-implementer` + `@security-auditor` | implemented |
| Build dependencies | Public npm | Typosquatting, dependency confusion | Lockfile + pinned versions + `npm audit` | `@security-auditor` + lang owners | implemented |
| Local secrets | Filesystem | `.env` accidentally committed | `.env` in `.gitignore`; `.env.example` placeholders only; pre-commit secret scan recommended | `@security-auditor` | implemented |

## Architecture & Design Pattern Decisions

| Decision | Selected pattern | Alternatives considered | Why | Risks / guardrails | ADR |
|---|---|---|---|---|---|
| Overall architecture | **Layered** (collect → persist → visualize): OTel collector → ClickHouse → TanStack dashboard | Event-sourced; CQRS | Layered is the standard observability shape and easy to evolve | Avoid lock-in: ClickHouse exporter is replaceable, dashboard reads via standard SQL | ADR-0000 |
| Telemetry ingress | OTel Collector as single ingress | Direct VS Code → backend per signal | Decouples backends; one place to do sampling + redaction; vendor-neutral | Single point of failure → document scaling and HA later | ADR-0001 |
| Deployment model | Compose-based local-first | Kubernetes / Nomad | YAGNI for local monitoring; fastest iteration | Document migration path if scope grows | ADR-0002 |
| Sensitive-content handling | Auth-header scrubbing + dashboard reveal-on-click for GenAI content | Disable capture entirely | Allows opt-in capture for debugging without leaking by default; dashboard defaults to redacted placeholder | Wire content redaction processor before enabling capture | ADR-0003 / ADR-0006 |
| Dashboard exposure | Loopback-by-default with opt-in LAN bind via `DASHBOARD_BIND_HOST` / `OTEL_BIND_HOST` env vars; ClickHouse stays loopback-only | Public bind; reverse proxy + TLS; mTLS on OTLP; mesh (Tailscale) | Local-LAN-first project; Basic Auth + rotated password is the v1 control | When joining an untrusted network, revert env vars to `127.0.0.1` OR add IP allowlist / TLS reverse proxy; OTLP receiver has no app-level auth (relies on `attributes/scrub-auth`) | ADR-0004 |
| Persistent storage | ClickHouse (single OLAP store) | Prometheus + Tempo split; SQLite | Per-call analytics need SQL over span attributes; columnar compression handles GB-scale telemetry | Single failure domain; alpha exporter for metrics — accept and monitor | ADR-0005 |
| Dashboard frontend | TanStack Start + shadcn/ui charts | Grafana with ClickHouse plugin; Vite SPA fallback | Full control over panel set, cost view, sortable per-call table; modern React 19 | TanStack Start is young — pin lockfile, Vite SPA contingency documented | ADR-0006 |

## ADR Index

| ADR | Decision | Owner | Status |
|---|---|---|---|
| ADR-0000 | Architecture intentionally deferred (now superseded by ADR-0005 / 0006) | `@architecture-reviewer` | superseded |
| ADR-0001 | OTel Collector as single ingress | `@architecture-reviewer` + `@otel-collector-engineer` | accepted |
| ADR-0002 | Compose-based local-first deployment | `@architecture-reviewer` + `@compose-engineer` | accepted |
| ADR-0003 | Attribute redaction strategy | `@architecture-reviewer` + `@otel-collector-engineer` | accepted |
| ADR-0004 | Dashboard and OTel collector exposure (loopback-default, opt-in LAN bind) | `@architecture-reviewer` | accepted |
| ADR-0005 | ClickHouse as the single persistent OLAP store | `@architecture-reviewer` + `@otel-collector-engineer` | accepted |
| ADR-0006 | TanStack Start dashboard as primary visualization | `@architecture-reviewer` + `@typescript-implementer` | accepted |

ADRs live at `docs/adr/NNNN-title.md` and are created by `@architecture-reviewer` as concrete decisions get made — not all upfront. Earlier ADRs about a dual-source dashboard or a SQLite agent-traces source were removed when the open-source release collapsed to a single ClickHouse source.

## Quality Gates

| Gate | Command or evidence | Owner | Required before done |
|---|---|---|---|
| Quality gate runner | `bash scripts/validate.sh all` (compose + yaml + shell + agents) | path owners | every PR (CI subset: `bash scripts/validate.sh ci`) |
| Compose lint | `docker compose config -q` returns clean | `@compose-engineer` | when compose is touched |
| YAML lint | `yamllint -s .` clean | path owner | when YAML is touched |
| Shell lint | `shellcheck **/*.sh && shfmt -d .` clean | path owner | when shell is touched |
| TS lint + typecheck | `cd apps/dashboard && pnpm typecheck` (`tsc --noEmit`) clean; `pnpm build` succeeds | `@typescript-implementer` | when TS is touched |
| Dashboard health | `bash scripts/validate.sh connectivity` (collector health + OTLP HTTP + ClickHouse `/ping` + dashboard `/api/healthz`) all green | `@compose-engineer` + `@typescript-implementer` | when stack composition or dashboard changes |
| Unit tests | `pnpm --dir apps/dashboard test:unit` all green | `@tester` | when tests are touched |
| Secret scan | `gitleaks detect --no-banner` clean | `@security-auditor` | every PR |
| Container scan | `trivy fs .` no HIGH/CRITICAL | `@security-auditor` | when images / Dockerfiles change |
| Supply-chain audit | `npm audit` no HIGH+ | `@security-auditor` | when manifests change |
| ADR coverage | Each "major decision" has an ADR file in `docs/adr/` | `@architecture-reviewer` | when boundaries / patterns change |
| Boundary respect | Agents only write within their owned paths in [Directory Architecture](#directory-architecture) | `@reviewer` | every PR |
| Diff summary | Every agent output ends with a one-paragraph diff summary | `@reviewer` | every PR |

## Skills

| Skill | When invoked | Bundles |
|---|---|---|
| `otel-pipeline-author` | Use when adding or extending an OTel collector pipeline (new receiver / processor / exporter, sampling, redaction) | Pipeline scaffold, redaction-processor template, golden-test fixture pattern |

## Plugins / MCP Servers

_None._ The user selected **"No external tools"** in the Phase 1.8 intake — Phase 3 marketplace lookup and Phase 3.5 MCP approval gate were both skipped intentionally. No `.mcp.json` is generated and no subagent emits a `mcp-servers:` key. To add MCP later, re-run the setup skill in `improve` mode.

## Build / Test / Lint

```bash
# Install
pnpm --dir apps/dashboard install

# Build / validate
docker compose config -q
docker compose build

# Test
pnpm --dir apps/dashboard typecheck
pnpm --dir apps/dashboard test:unit
pnpm --dir apps/dashboard build
pnpm --dir apps/dashboard test:e2e         # Playwright (requires running stack)
./scripts/setup-terminal.ps1               # Windows PowerShell Copilot CLI setup

# Lint
bash scripts/validate.sh all
yamllint -s .
shellcheck **/*.sh
shfmt -d .
pnpm --dir apps/dashboard lint

# Security
gitleaks detect --no-banner
trivy fs .
```

## Conventions

- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- **Branches:** Trunk-based; short-lived feature branches off `main`.
- **Code style:** prettier (TS/JSON/MD), shfmt (bash), yamlfmt (YAML).
- **Telemetry safety:** never enable `COPILOT_OTEL_CAPTURE_CONTENT=true` against a backend without redaction.

<!-- agents-system-setup:managed:end -->

<!-- Add project-specific guidance below this line; it will be preserved on updates. -->
