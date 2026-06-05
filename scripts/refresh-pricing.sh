#!/usr/bin/env bash
# Refresh the litellm pricing snapshot used by the dashboard.
# Honors SKIP_PRICING_REFRESH=1 (silent no-op) so CI / offline installs
# can opt out without failing.
set -euo pipefail

if [[ "${SKIP_PRICING_REFRESH:-0}" == "1" ]]; then
	exit 0
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="$ROOT/apps/dashboard/app/server/data/litellm-prices.json"
META_FILE="$ROOT/apps/dashboard/app/server/data/litellm-prices-meta.json"
URL="https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
SOURCE_URL="https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json"

mkdir -p "$(dirname "$FILE")"
curl --fail --silent --show-error -o "$FILE" "$URL"
SNAPSHOT_DATE="${PRICING_SNAPSHOT_DATE:-$(date -u +%Y-%m-%d)}"
cat >"$META_FILE" <<EOF
{
  "source": "$SOURCE_URL",
  "snapshotDate": "$SNAPSHOT_DATE"
}
EOF

echo "[refresh-pricing] wrote $(wc -c <"$FILE") bytes"
