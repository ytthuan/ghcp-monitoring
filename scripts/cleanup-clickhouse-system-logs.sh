#!/usr/bin/env bash
# cleanup-clickhouse-system-logs.sh
#
# Truncates ClickHouse's own diagnostic log tables. These tables live in the
# `system` database and are separate from Copilot telemetry in `copilot_telemetry`.
# Dry-run by default; pass --apply to mutate.

set -euo pipefail

APPLY=0

SYSTEM_LOG_TABLES=(
	asynchronous_insert_log
	asynchronous_metric_log
	error_log
	metric_log
	part_log
	processors_profile_log
	query_log
	query_metric_log
	query_thread_log
	query_views_log
	session_log
	text_log
	trace_log
	opentelemetry_span_log
)

usage() {
	cat <<'USAGE'
Usage: scripts/cleanup-clickhouse-system-logs.sh [--apply]

Flush and truncate ClickHouse internal diagnostic log tables in system.*.
This never truncates copilot_telemetry.* user telemetry tables.

Options:
  --apply    Actually truncate the allowlisted system log tables.
  -h, --help Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--apply)
		APPLY=1
		shift
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "unknown argument: $1" >&2
		usage >&2
		exit 2
		;;
	esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

require_stack() {
	if ! command -v docker >/dev/null 2>&1; then
		echo "docker is required" >&2
		exit 1
	fi
	if ! docker compose ps --status running clickhouse 2>/dev/null | grep -q clickhouse; then
		echo "clickhouse container is not running; start it with: docker compose up -d clickhouse" >&2
		exit 1
	fi
}

ch_query() {
	local sql="$1"
	docker compose exec -T clickhouse sh -eu -c '
		clickhouse-client \
			--user "${CLICKHOUSE_USER:-default}" \
			--password "${CLICKHOUSE_PASSWORD:-}" \
			--database system \
			--query "$1"
	' sh "$sql"
}

sql_string_list() {
	local item
	local out=""
	for item in "$@"; do
		[ -n "$out" ] && out="${out},"
		out="${out}'${item}'"
	done
	printf '%s' "$out"
}

validate_identifier() {
	local identifier="$1"
	if [[ ! "$identifier" =~ ^[A-Za-z0-9_]+$ ]]; then
		echo "unsafe identifier: $identifier" >&2
		exit 1
	fi
}

app_db_name() {
	local db
	db="$(docker compose exec -T clickhouse sh -eu -c 'printf "%s" "${CLICKHOUSE_DB:-copilot_telemetry}"')"
	validate_identifier "$db"
	printf '%s' "$db"
}

table_exists() {
	local table="$1"
	validate_identifier "$table"
	local count
	count="$(
		ch_query "SELECT count() FROM system.tables WHERE database = 'system' AND name = '${table}' FORMAT TabSeparated"
	)"
	[ "$count" = "1" ]
}

show_system_log_summary() {
	local table_list
	table_list="$(sql_string_list "${SYSTEM_LOG_TABLES[@]}")"
	ch_query "
		SELECT
			table,
			active,
			count() AS parts,
			sum(rows) AS rows,
			formatReadableSize(sum(bytes_on_disk)) AS disk
		FROM system.parts
		WHERE database = 'system'
		  AND table IN (${table_list})
		GROUP BY table, active
		ORDER BY disk DESC, parts DESC
		FORMAT PrettyCompact
	"
}

show_user_telemetry_summary() {
	local db="$1"
	ch_query "
		SELECT
			name,
			engine,
			total_rows,
			formatReadableSize(total_bytes) AS bytes
		FROM system.tables
		WHERE database = '${db}'
		  AND engine NOT LIKE '%View%'
		ORDER BY total_bytes DESC
		FORMAT PrettyCompact
	"
}

require_stack
APP_DB="$(app_db_name)"

echo "==> ClickHouse user telemetry summary (${APP_DB})"
show_user_telemetry_summary "$APP_DB"

echo
echo "==> ClickHouse internal system log footprint"
show_system_log_summary

if [ "$APPLY" -ne 1 ]; then
	echo
	echo "DRY RUN: re-run with --apply to truncate only the allowlisted system log tables."
	exit 0
fi

echo
echo "==> Flushing ClickHouse logs before truncation"
ch_query "SYSTEM FLUSH LOGS"

echo
echo "==> Truncating allowlisted system log tables"
for table in "${SYSTEM_LOG_TABLES[@]}"; do
	validate_identifier "$table"
	if table_exists "$table"; then
		echo "  truncate system.${table}"
		ch_query "TRUNCATE TABLE IF EXISTS system.${table} SYNC"
	else
		echo "  skip system.${table} (not present)"
	fi
done

echo
echo "==> Post-cleanup system log footprint"
show_system_log_summary

echo
echo "Done. If disk usage does not drop immediately, wait for old parts to age out before measuring again."
