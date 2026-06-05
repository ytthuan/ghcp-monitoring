#!/usr/bin/env bash
# validate.sh — local-first quality gates for ghcp-monitoring.
# Subcommands tolerate missing tools (skip with a clear note) so the script
# is useful both in pre-commit hooks and in CI later.
#
# Usage:
#   bash scripts/validate.sh             # same as 'all'
#   bash scripts/validate.sh all         # static checks: compose + yaml + shell + agents
#   bash scripts/validate.sh ci          # CI subset: compose + yaml + shell
#   bash scripts/validate.sh compose     # only compose
#   bash scripts/validate.sh yaml        # only yamllint
#   bash scripts/validate.sh shell       # only shellcheck + shfmt
#   bash scripts/validate.sh agents      # only AGENTS.md + .github/agents frontmatter (local-only)
#   bash scripts/validate.sh connectivity # collector health + OTLP HTTP smoke test
#   bash scripts/validate.sh smoke       # alias for connectivity
#   bash scripts/validate.sh -h          # help
#
# Exit codes:
#   0 — all selected checks passed (or were skipped because tool missing)
#   1 — at least one check FAILED (tool present, but rules violated)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# --- helpers --------------------------------------------------------------

c_red() { printf '\033[31m%s\033[0m' "$*"; }
c_green() { printf '\033[32m%s\033[0m' "$*"; }
c_yellow() { printf '\033[33m%s\033[0m' "$*"; }
c_blue() { printf '\033[34m%s\033[0m' "$*"; }

PASS=0
FAIL=0
SKIP=0
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ghcp-validate.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

ok() {
	echo "  $(c_green '✅') $*"
	PASS=$((PASS + 1))
}
bad() {
	echo "  $(c_red '❌') $*"
	FAIL=$((FAIL + 1))
}
skip() {
	echo "  $(c_yellow '⊘ ') $*"
	SKIP=$((SKIP + 1))
}
hdr() {
	echo
	echo "$(c_blue '==>') $*"
}

have() { command -v "$1" >/dev/null 2>&1; }

usage() {
	sed -n '2,20p' "$0"
}

dotenv_value() {
	local key="$1"
	[ -f .env ] || return 1
	awk -F= -v key="$key" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    $1 == key {
      sub(/^[^=]*=/, "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      gsub(/^"|"$/, "")
      print
      exit
    }
  ' .env
}

# --- check_compose --------------------------------------------------------

check_compose() {
	hdr "compose: docker compose config -q"
	shopt -s nullglob
	local files=(docker-compose*.yml docker-compose*.yaml)
	shopt -u nullglob
	if [ ${#files[@]} -eq 0 ]; then
		skip "no docker-compose*.yml files yet"
		return 0
	fi
	if ! have docker; then
		skip "docker not installed"
		return 0
	fi
	if docker compose config -q 2>"$TMP_DIR/validate-compose.err"; then
		ok "docker compose config valid"
	else
		bad "docker compose config failed:"
		sed 's/^/      /' "$TMP_DIR/validate-compose.err"
	fi
}

# --- check_yaml -----------------------------------------------------------

check_yaml() {
	hdr "yaml: yamllint -s (project files only)"
	if ! have yamllint; then
		skip "yamllint not installed (pip install yamllint)"
		return 0
	fi
	local yaml_files=()
	while IFS= read -r -d '' f; do
		yaml_files+=("$f")
	done < <(find . -type f \( -name '*.yml' -o -name '*.yaml' \) \
		-not -path '*/node_modules/*' \
		-not -path '*/dist/*' \
		-not -path '*/.tanstack/*' \
		-not -path '*/.output/*' \
		-not -path '*/.git/*' \
		-not -path '*/.venv/*' \
		-not -name 'pnpm-lock.yaml' \
		-not -name 'package-lock.yaml' -print0)
	if [ ${#yaml_files[@]} -eq 0 ]; then
		skip "no YAML files yet"
		return 0
	fi

	local failed=0
	: >"$TMP_DIR/validate-yaml.err"
	local batch=()
	local batch_size=128
	flush_batch() {
		[ ${#batch[@]} -gt 0 ] || return 0
		if ! yamllint -s "${batch[@]}" >>"$TMP_DIR/validate-yaml.err" 2>&1; then
			failed=1
		fi
		batch=()
	}

	for f in "${yaml_files[@]}"; do
		batch+=("$f")
		if [ ${#batch[@]} -ge "$batch_size" ]; then
			flush_batch
		fi
	done
	flush_batch

	if [ "$failed" -eq 0 ]; then
		ok "yamllint clean (${#yaml_files[@]} file(s))"
	else
		bad "yamllint findings:"
		sed 's/^/      /' "$TMP_DIR/validate-yaml.err"
	fi
}

# --- check_shell ----------------------------------------------------------

check_shell() {
	hdr "shell: shellcheck + shfmt"
	local sh_files=()
	while IFS= read -r -d '' f; do
		sh_files+=("$f")
	done < <(find . -type f -name '*.sh' \
		-not -path '*/node_modules/*' \
		-not -path '*/dist/*' \
		-not -path '*/.tanstack/*' \
		-not -path '*/.output/*' \
		-not -path '*/.git/*' \
		-not -path '*/.venv/*' -print0)
	if [ ${#sh_files[@]} -eq 0 ]; then
		skip "no .sh files yet"
		return 0
	fi
	if have shellcheck; then
		if shellcheck "${sh_files[@]}" 2>"$TMP_DIR/validate-shellcheck.err"; then
			ok "shellcheck clean (${#sh_files[@]} file(s))"
		else
			bad "shellcheck findings:"
			sed 's/^/      /' "$TMP_DIR/validate-shellcheck.err"
		fi
	else
		skip "shellcheck not installed (brew install shellcheck)"
	fi
	if have shfmt; then
		if shfmt -d "${sh_files[@]}" >"$TMP_DIR/validate-shfmt.diff" 2>&1; then
			ok "shfmt format clean"
		else
			bad "shfmt found unformatted files:"
			sed 's/^/      /' "$TMP_DIR/validate-shfmt.diff" | head -50
		fi
	else
		skip "shfmt not installed (brew install shfmt)"
	fi
}

# --- check_agents (local-only — files are git-excluded) -------------------

check_agents() {
	hdr "agents: AGENTS.md sections + .github/agents frontmatter"
	if [ ! -f AGENTS.md ]; then
		skip "AGENTS.md not present (excluded via .git/info/exclude — local-only)"
		return 0
	fi

	local required_sections=(
		"## Read First"
		"## Context Loading Policy"
		"## Directory Architecture"
		"## Agent Roster"
		"## Capability × Agent Matrix"
		"## Wave Plan"
		"## Security & Audit Matrix"
		"## Threat Model"
		"## Architecture & Design Pattern Decisions"
		"## ADR Index"
		"## Quality Gates"
		"## Skills"
		"## Plugins / MCP Servers"
	)
	local missing=0
	for section in "${required_sections[@]}"; do
		if ! grep -qF "$section" AGENTS.md; then
			bad "AGENTS.md missing: $section"
			missing=$((missing + 1))
		fi
	done
	[ "$missing" -eq 0 ] && ok "AGENTS.md has all 13 governance sections"

	if [ ! -d .github/agents ]; then
		skip ".github/agents/ not present"
		return 0
	fi

	shopt -s nullglob
	local agent_files=(.github/agents/*.agent.md)
	shopt -u nullglob
	if [ ${#agent_files[@]} -eq 0 ]; then
		skip ".github/agents/ has no *.agent.md files"
		return 0
	fi

	local bad_count=0
	for f in "${agent_files[@]}"; do
		local base name desc
		base=$(basename "$f" .agent.md)
		name=$(awk '/^---$/{f++; next} f==1 && /^name:[[:space:]]/{print $2; exit}' "$f")
		desc=$(awk '/^---$/{f++; next} f==1 && /^description:[[:space:]]/{$1=""; print substr($0,2); exit}' "$f")
		if [ "$name" != "$base" ]; then
			bad "$f: name '$name' != filename '$base'"
			bad_count=$((bad_count + 1))
		fi
		if ! echo "$desc" | grep -qi "^['\"]\?use when"; then
			bad "$f: description must start with 'Use when'"
			bad_count=$((bad_count + 1))
		fi
	done
	[ "$bad_count" -eq 0 ] && ok "${#agent_files[@]} agent frontmatters valid"

	shopt -s nullglob
	local skill_files=(.github/skills/*/SKILL.md)
	shopt -u nullglob
	if [ ${#skill_files[@]} -gt 0 ]; then
		local sbad=0
		for f in "${skill_files[@]}"; do
			local sname sbase
			sbase=$(basename "$(dirname "$f")")
			sname=$(awk '/^---$/{f++; next} f==1 && /^name:[[:space:]]/{print $2; exit}' "$f")
			if [ "$sname" != "$sbase" ]; then
				bad "$f: name '$sname' != dirname '$sbase'"
				sbad=$((sbad + 1))
			fi
		done
		[ "$sbad" -eq 0 ] && ok "${#skill_files[@]} skill frontmatters valid"
	fi
}

# --- check_connectivity -----------------------------------------------------

check_connectivity() {
	hdr "connectivity: collector health + OTLP HTTP + clickhouse + dashboard"
	if ! have curl; then
		skip "curl not installed"
		return 0
	fi

	local health_port http_port health_url traces_url status
	health_port="${OTEL_HEALTH_PORT:-$(dotenv_value OTEL_HEALTH_PORT || true)}"
	health_port="${health_port:-13133}"
	http_port="${OTEL_HTTP_PORT:-$(dotenv_value OTEL_HTTP_PORT || true)}"
	http_port="${http_port:-4318}"
	health_url="http://127.0.0.1:${health_port}/"
	traces_url="http://127.0.0.1:${http_port}/v1/traces"

	if curl -fsS --max-time 5 "$health_url" >"$TMP_DIR/validate-otel-health.out" 2>"$TMP_DIR/validate-otel-health.err"; then
		ok "collector health endpoint responded at $health_url"
	else
		bad "collector health endpoint failed at $health_url (is docker compose up -d running?)"
		sed 's/^/      /' "$TMP_DIR/validate-otel-health.err"
	fi

	local start_ns end_ns payload smoke_trace_id smoke_span_id
	start_ns="$(date +%s)000000000"
	end_ns="$((start_ns + 1000000))"
	smoke_trace_id="$(printf '%016x%016x' "$(date +%s)" "$$")"
	smoke_span_id="$(printf '%016x' "$$")"
	payload=$(
		cat <<JSON
{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"github-copilot-smoke-test"}}]},"scopeSpans":[{"scope":{"name":"ghcp-monitoring.validate"},"spans":[{"traceId":"${smoke_trace_id}","spanId":"${smoke_span_id}","name":"terminal-connectivity-smoke-test","kind":1,"startTimeUnixNano":"${start_ns}","endTimeUnixNano":"${end_ns}"}]}]}]}
JSON
	)

	status=$(curl -sS --max-time 5 -o "$TMP_DIR/validate-otlp-http.out" -w "%{http_code}" \
		-X POST "$traces_url" \
		-H "Content-Type: application/json" \
		--data "$payload" 2>"$TMP_DIR/validate-otlp-http.err" || true)
	if [ "$status" = "200" ]; then
		ok "OTLP HTTP trace accepted at $traces_url"
	else
		bad "OTLP HTTP trace failed at $traces_url (HTTP $status)"
		sed 's/^/      /' "$TMP_DIR/validate-otlp-http.err"
		sed 's/^/      /' "$TMP_DIR/validate-otlp-http.out"
	fi

	# ClickHouse ping — service has no host port, so probe from inside the
	# container. Gracefully skip if docker / the stack isn't available.
	if ! have docker; then
		skip "clickhouse ping skipped (docker not installed)"
	elif ! docker compose ps --status running clickhouse 2>/dev/null | grep -q clickhouse; then
		skip "clickhouse ping skipped (clickhouse container not running)"
	elif docker compose exec -T clickhouse wget -qO- http://localhost:8123/ping \
		>"$TMP_DIR/validate-ch-ping.out" 2>"$TMP_DIR/validate-ch-ping.err"; then
		ok "clickhouse responded to /ping (in-container)"
	else
		bad "clickhouse /ping failed (in-container exec)"
		sed 's/^/      /' "$TMP_DIR/validate-ch-ping.err"
	fi

	if [ "$status" = "200" ] && have docker && docker compose ps --status running clickhouse 2>/dev/null | grep -q clickhouse; then
		local smoke_found smoke_count attempt
		smoke_found=0
		attempt=1
		while [ "$attempt" -le 15 ]; do
			smoke_count=$(
				docker compose exec -T clickhouse sh -c \
					'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB" --query "SELECT count() FROM otel_traces WHERE TraceId = '\''$1'\'' FORMAT TabSeparated" 2>/dev/null' \
					sh "$smoke_trace_id" 2>"$TMP_DIR/validate-ch-smoke.err" || true
			)
			if [ "${smoke_count:-0}" -gt 0 ] 2>/dev/null; then
				smoke_found=1
				break
			fi
			attempt=$((attempt + 1))
			sleep 2
		done
		if [ "$smoke_found" -eq 1 ]; then
			ok "OTLP smoke trace persisted in the configured ClickHouse database"
		else
			bad "OTLP smoke trace was accepted but not found in the configured ClickHouse database"
			sed 's/^/      /' "$TMP_DIR/validate-ch-smoke.err"
		fi
	fi

	# Dashboard /api/healthz — bound to loopback on DASHBOARD_PORT (default 6969).
	local dashboard_port dashboard_url
	dashboard_port="${DASHBOARD_PORT:-$(dotenv_value DASHBOARD_PORT || true)}"
	dashboard_port="${dashboard_port:-6969}"
	dashboard_url="http://127.0.0.1:${dashboard_port}/api/healthz"
	if curl -fsS --max-time 5 "$dashboard_url" \
		>"$TMP_DIR/validate-dashboard.out" 2>"$TMP_DIR/validate-dashboard.err"; then
		ok "dashboard health endpoint responded at $dashboard_url"
	else
		bad "dashboard health endpoint failed at $dashboard_url (is docker compose up -d running?)"
		sed 's/^/      /' "$TMP_DIR/validate-dashboard.err"
	fi

	# Dashboard root probe — requires Basic Auth after the auth middleware
	# lands. Defaults match .env.example so a stock checkout still passes.
	local dashboard_user dashboard_pass dashboard_root
	dashboard_user="${DASHBOARD_USER:-$(dotenv_value DASHBOARD_USER || true)}"
	dashboard_user="${dashboard_user:-admin}"
	dashboard_pass="${DASHBOARD_PASSWORD:-$(dotenv_value DASHBOARD_PASSWORD || true)}"
	dashboard_pass="${dashboard_pass:-admin}"
	dashboard_root="http://127.0.0.1:${dashboard_port}/"
	if curl -fsS --max-time 5 -u "${dashboard_user}:${dashboard_pass}" "$dashboard_root" \
		>"$TMP_DIR/validate-dashboard-root.out" 2>"$TMP_DIR/validate-dashboard-root.err"; then
		ok "dashboard root authenticated at $dashboard_root"
	else
		bad "dashboard root failed at $dashboard_root (auth or service down?)"
		sed 's/^/      /' "$TMP_DIR/validate-dashboard-root.err"
	fi
}

# --- dispatch -------------------------------------------------------------

cmd="${1:-all}"
case "$cmd" in
-h | --help | help)
	usage
	exit 0
	;;
all)
	check_compose
	check_yaml
	check_shell
	check_agents
	;;
ci)
	check_compose
	check_yaml
	check_shell
	;;
compose) check_compose ;;
yaml) check_yaml ;;
shell) check_shell ;;
agents) check_agents ;;
connectivity) check_connectivity ;;
smoke) check_connectivity ;;
*)
	echo "unknown subcommand: $cmd" >&2
	usage
	exit 2
	;;
esac

echo
echo "$(c_blue '==>') summary: $(c_green "$PASS pass") · $(c_red "$FAIL fail") · $(c_yellow "$SKIP skipped")"
[ "$FAIL" -eq 0 ]
