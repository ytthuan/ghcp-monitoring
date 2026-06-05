# Contributing to ghcp-monitoring

Thanks for your interest in improving `ghcp-monitoring`! This project is a
local-first observability stack for GitHub Copilot telemetry. Contributions of
all sizes are welcome - bug reports, docs, panels, collector tuning, and tests.

By participating, you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** - open an issue using the bug template. Include your OS,
  Docker version, and `docker compose ps` / collector logs (with content
  redacted).
- **Request a feature** - open an issue using the feature template and describe
  the telemetry question you're trying to answer.
- **Improve docs** - README, runbooks under `docs/`, and inline comments.
- **Send a pull request** - see the workflow below.

> **Never attach raw telemetry, `.env` files, ClickHouse dumps, or captured
> prompt/response content to issues or PRs.** They can contain secrets, code,
> and file paths. Redact first.

## Development setup

```bash
git clone https://github.com/ytthuan/ghcp-monitoring.git
cd ghcp-monitoring
cp .env.example .env            # set a strong CLICKHOUSE_PASSWORD
docker compose up -d            # collector + ClickHouse + dashboard

# Dashboard development (Node >= 22, pnpm 9.15.0 via `corepack enable`)
pnpm --dir apps/dashboard install
pnpm --dir apps/dashboard dev   # http://127.0.0.1:3000
```

## Quality gates

Run the relevant checks before opening a PR. CI runs the same ones.

```bash
# Infrastructure (compose / yaml / shell / AGENTS.md)
bash scripts/validate.sh all

# Dashboard (when you touch apps/dashboard/)
pnpm --dir apps/dashboard typecheck
pnpm --dir apps/dashboard lint
pnpm --dir apps/dashboard test:unit
pnpm --dir apps/dashboard build

# Security (recommended before every PR)
gitleaks detect --no-banner
```

A change is "done" only when the gates relevant to the files you touched pass.
See `AGENTS.md` -> **Quality Gates** for the full matrix.

## Pull request workflow

1. **Fork** and create a short-lived branch off `main`
   (e.g. `feat/cache-panel`, `fix/ttft-null`).
2. **Make focused changes.** Keep PRs scoped to one concern; don't bundle
   unrelated refactors.
3. **Respect ownership boundaries.** `AGENTS.md` -> **Directory Architecture**
   documents which area each change belongs to. Pipeline configs live in
   `config/` and `otel/`; container wiring in `docker-compose.yml`; the UI in
   `apps/dashboard/`.
4. **Run the quality gates** above.
5. **Open the PR** using the template. Describe what changed, why, and how you
   verified it. Link any related issue.
6. **Keep secrets out.** No real credentials, connection strings, or captured
   content in code, configs, or fixtures - only `${ENV_VAR}` references and
   `.env.example` placeholders.

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add cache-hit ratio panel
fix: handle null ttft in latency query
docs: clarify LAN-bind hardening steps
chore: bump collector image digest
refactor: extract clickhouse client factory
test: cover finish-reason rollup
```

## Architecture decisions

Significant changes to module boundaries, storage, exposure, or the dashboard
contract should be accompanied by an ADR in `docs/adr/NNNN-title.md`. Look at
the existing ADRs (0001-0006) for the format. Mention the ADR in your PR.

## Reporting security issues

Do **not** open a public issue for vulnerabilities. Follow
[`SECURITY.md`](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
