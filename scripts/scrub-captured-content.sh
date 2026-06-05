#!/usr/bin/env bash
# scrub-captured-content.sh
#
# Defense-in-depth at-rest scrubber for Copilot telemetry rows that carry
# raw prompt / completion / tool-call content. Targets ClickHouse tables
# populated by the OTel ClickHouse exporter:
#   - copilot_telemetry.otel_traces  (SpanAttributes map)
#   - copilot_telemetry.otel_logs    (LogAttributes map + Body)
#   - copilot_telemetry.otel_metrics_* (Attributes map; defensive)
#
# It removes the seven well-known content-bearing attribute keys in place
# via ALTER TABLE ... UPDATE mapFilter(...). Non-sensitive observability
# columns (timestamps, durations, model, token counts) are preserved.
#
# Dry-run by default. Pass --apply to mutate.
#
# See docs/runbooks/captured-content-remediation.md for full procedure.

set -euo pipefail

APPLY=0
for arg in "$@"; do
	case "$arg" in
	--apply) APPLY=1 ;;
	-h | --help)
		sed -n '2,20p' "$0"
		exit 0
		;;
	*)
		echo "unknown arg: $arg" >&2
		exit 2
		;;
	esac
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$REPO_ROOT/.env" ]; then
	set -a
	# shellcheck source=/dev/null
	. "$REPO_ROOT/.env"
	set +a
fi

CLICKHOUSE_HTTP_URL="${CLICKHOUSE_HTTP_URL:-http://127.0.0.1:8123}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-default}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-}"
CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-${CLICKHOUSE_DB:-copilot_telemetry}}"

# Sensitive attribute keys that may carry verbatim prompt / completion /
# tool-call content. Keep in sync with apps/dashboard/app/components/data
# isSensitiveAttr() / shouldRedactLogBody().
SENSITIVE_KEYS=(
	"gen_ai.input.messages"
	"gen_ai.output.messages"
	"gen_ai.system_instructions"
	"gen_ai.tool.call.arguments"
	"gen_ai.tool.call.result"
	"gen_ai.tool.definitions"
	"copilot_chat.user_request"
)

# ---- helpers ---------------------------------------------------------------

# Build a SQL array literal: ('a','b',...)
sql_in_list() {
	local out=""
	local k
	for k in "${SENSITIVE_KEYS[@]}"; do
		[ -n "$out" ] && out="$out,"
		out="$out'$k'"
	done
	printf '(%s)' "$out"
}

# Build a SQL array literal: ['a','b',...]
sql_array_list() {
	local out=""
	local k
	for k in "${SENSITIVE_KEYS[@]}"; do
		[ -n "$out" ] && out="$out,"
		out="$out'$k'"
	done
	printf '[%s]' "$out"
}

# Build OR-joined `has(mapKeys(<col>),'k')` predicate.
sql_has_any() {
	local col="$1"
	local out=""
	local k
	for k in "${SENSITIVE_KEYS[@]}"; do
		[ -n "$out" ] && out="$out OR "
		out="${out}has(mapKeys(${col}), '${k}')"
	done
	printf '%s' "$out"
}

ch_query() {
	# stdin = SQL; stdout = response body; non-zero on HTTP error.
	local body
	local http
	body="$(mktemp -t chbody)"
	# shellcheck disable=SC2064
	trap "rm -f '$body'" RETURN
	http="$(curl -sS -o "$body" -w '%{http_code}' \
		-u "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" \
		"${CLICKHOUSE_HTTP_URL}/?database=${CLICKHOUSE_DATABASE}" \
		--data-binary @-)"
	cat "$body"
	if [ "$http" != "200" ]; then
		echo "clickhouse HTTP $http" >&2
		return 1
	fi
}

table_exists() {
	local t="$1"
	local n
	n="$(printf "SELECT count() FROM system.tables WHERE database='%s' AND name='%s' FORMAT TabSeparated" \
		"$CLICKHOUSE_DATABASE" "$t" | ch_query)"
	[ "$n" = "1" ]
}

list_metric_tables() {
	printf "SELECT name FROM system.tables WHERE database='%s' AND name LIKE 'otel_metrics_%%' AND engine NOT LIKE '%%View%%' FORMAT TabSeparated" \
		"$CLICKHOUSE_DATABASE" | ch_query
}

# ---- preflight -------------------------------------------------------------

echo "── scrub-captured-content (dry-run=$([ $APPLY -eq 0 ] && echo yes || echo NO)) ──"
echo "clickhouse: ${CLICKHOUSE_HTTP_URL}  db=${CLICKHOUSE_DATABASE}  user=${CLICKHOUSE_USER}"
echo

KEY_LIST="$(sql_in_list)"
KEY_ARRAY="$(sql_array_list)"

# ---- pre-condition counts --------------------------------------------------

echo "── pre-condition: rows carrying sensitive content ──"

if table_exists otel_traces; then
	echo
	echo "[otel_traces] per-key non-empty counts:"
	{
		printf "SELECT key, countIf(SpanAttributes[key] != '') AS rows_with_value\n"
		printf "FROM copilot_telemetry.otel_traces\n"
		printf "ARRAY JOIN %s AS key\n" "$KEY_ARRAY"
		printf "GROUP BY key ORDER BY key FORMAT PrettyCompactMonoBlock\n"
	} | ch_query
	echo
	echo "[otel_traces] total rows with ANY sensitive key present:"
	{
		printf "SELECT count() AS rows_to_scrub, (SELECT count() FROM copilot_telemetry.otel_traces) AS total\n"
		printf "FROM copilot_telemetry.otel_traces WHERE %s FORMAT PrettyCompactMonoBlock\n" \
			"$(sql_has_any SpanAttributes)"
	} | ch_query
fi

if table_exists otel_logs; then
	echo
	echo "[otel_logs] rows with sensitive LogAttributes keys:"
	{
		printf "SELECT count() AS rows_to_scrub, countIf(Body != '') AS with_nonempty_body, (SELECT count() FROM copilot_telemetry.otel_logs) AS total\n"
		printf "FROM copilot_telemetry.otel_logs WHERE %s FORMAT PrettyCompactMonoBlock\n" \
			"$(sql_has_any LogAttributes)"
	} | ch_query
fi

METRIC_TABLES="$(list_metric_tables || true)"
if [ -n "$METRIC_TABLES" ]; then
	echo
	echo "[otel_metrics_*] (defensive) rows with sensitive Attributes keys:"
	while IFS= read -r mt; do
		[ -z "$mt" ] && continue
		printf "  %-40s " "$mt"
		{
			printf "SELECT count() FROM copilot_telemetry.%s WHERE %s FORMAT TabSeparated\n" \
				"$mt" "$(sql_has_any Attributes)"
		} | ch_query
	done <<<"$METRIC_TABLES"
fi

# ---- mutation SQL ----------------------------------------------------------

build_alter_map() {
	# $1 = table, $2 = map column
	local t="$1" col="$2"
	cat <<SQL
ALTER TABLE copilot_telemetry.${t}
  UPDATE ${col} = mapFilter((k, v) -> NOT (k IN ${KEY_LIST}), ${col})
  WHERE $(sql_has_any "$col");
SQL
}

build_alter_logs_body() {
	cat <<SQL
ALTER TABLE copilot_telemetry.otel_logs
  UPDATE Body = ''
  WHERE Body != '' AND ($(sql_has_any LogAttributes));
SQL
}

echo
echo "── planned mutations (ALTER ... UPDATE is async, mutates parts in background) ──"
if table_exists otel_traces; then
	echo
	build_alter_map otel_traces SpanAttributes
fi
if table_exists otel_logs; then
	echo
	build_alter_map otel_logs LogAttributes
	echo
	build_alter_logs_body
fi
if [ -n "$METRIC_TABLES" ]; then
	while IFS= read -r mt; do
		[ -z "$mt" ] && continue
		echo
		build_alter_map "$mt" Attributes
	done <<<"$METRIC_TABLES"
fi

if [ "$APPLY" -ne 1 ]; then
	echo
	echo "── DRY RUN ── re-run with --apply to execute. Nothing was mutated."
	exit 0
fi

# ---- apply -----------------------------------------------------------------

echo
echo "── APPLYING ──"

run_alter() {
	echo ">> $1"
	echo "$2" | ch_query >/dev/null
}

if table_exists otel_traces; then
	run_alter "otel_traces.SpanAttributes" "$(build_alter_map otel_traces SpanAttributes)"
fi
if table_exists otel_logs; then
	run_alter "otel_logs.LogAttributes" "$(build_alter_map otel_logs LogAttributes)"
	run_alter "otel_logs.Body" "$(build_alter_logs_body)"
fi
if [ -n "$METRIC_TABLES" ]; then
	while IFS= read -r mt; do
		[ -z "$mt" ] && continue
		run_alter "${mt}.Attributes" "$(build_alter_map "$mt" Attributes)"
	done <<<"$METRIC_TABLES"
fi

echo
echo "── waiting for in-flight mutations to settle (max 120s) ──"
for _ in $(seq 1 60); do
	pending="$(printf "SELECT count() FROM system.mutations WHERE database='%s' AND is_done=0 FORMAT TabSeparated" \
		"$CLICKHOUSE_DATABASE" | ch_query)"
	echo "  pending mutations: $pending"
	[ "$pending" = "0" ] && break
	sleep 2
done

# ---- post-condition --------------------------------------------------------

echo
echo "── post-condition: should be zero ──"
if table_exists otel_traces; then
	echo "[otel_traces] rows with any sensitive key:"
	{
		printf "SELECT count() FROM copilot_telemetry.otel_traces WHERE %s FORMAT TabSeparated\n" \
			"$(sql_has_any SpanAttributes)"
	} | ch_query
fi
if table_exists otel_logs; then
	echo "[otel_logs] rows with any sensitive key:"
	{
		printf "SELECT count() FROM copilot_telemetry.otel_logs WHERE %s FORMAT TabSeparated\n" \
			"$(sql_has_any LogAttributes)"
	} | ch_query
fi

echo
echo "── done ──"
