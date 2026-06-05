#!/usr/bin/env bash
# Local dev for the Copilot dashboard. Requires the docker compose stack
# (clickhouse + otel-collector) to be running.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
if ! command -v pnpm >/dev/null 2>&1; then
	echo "pnpm not installed. Install with: corepack enable" >&2
	exit 1
fi
pnpm --dir apps/dashboard install
exec pnpm --dir apps/dashboard dev
