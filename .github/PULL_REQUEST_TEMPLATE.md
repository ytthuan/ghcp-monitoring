## Summary

<!-- What changed and why? -->

## Verification

<!-- Paste the checks you ran and their results. -->

- [ ] `bash scripts/validate.sh all`
- [ ] `pnpm --dir apps/dashboard typecheck`
- [ ] `pnpm --dir apps/dashboard lint`
- [ ] `pnpm --dir apps/dashboard test:unit`
- [ ] `pnpm --dir apps/dashboard build`
- [ ] `gitleaks detect --no-banner` (or explain why unavailable)

## Security and privacy

- [ ] No `.env` values, credentials, raw telemetry, prompts, responses, code snippets, or file paths from private machines are included.
- [ ] `COPILOT_OTEL_CAPTURE_CONTENT` remains `false` by default.
- [ ] Dashboard or collector exposure remains loopback-only unless the PR explicitly documents an opt-in hardening path.

## Architecture / docs

- [ ] User-facing behavior is documented in `README.md`, `docs/`, or `apps/dashboard/README.md` when needed.
- [ ] Architecture-impacting changes include or update an ADR under `docs/adr/`.
- [ ] Relevant `AGENTS.md` ownership and quality-gate guidance remains accurate.
