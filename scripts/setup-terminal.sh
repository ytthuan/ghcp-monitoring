#!/usr/bin/env bash
# Source this file from a terminal before running GitHub Copilot CLI commands.

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
	echo "This script must be sourced so exports affect your current shell:"
	echo "  source scripts/setup-terminal.sh"
	exit 1
fi

export COPILOT_OTEL_ENABLED=true
export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_SERVICE_NAME="${OTEL_SERVICE_NAME:-github-copilot}"
# Default is OFF. Set COPILOT_OTEL_CAPTURE_CONTENT=true explicitly in your
# shell BEFORE sourcing this script if you intentionally want to capture
# prompts/responses for a trusted, scoped debugging session.
export COPILOT_OTEL_CAPTURE_CONTENT="${COPILOT_OTEL_CAPTURE_CONTENT:-false}"

echo "Copilot CLI telemetry configured for OTLP HTTP at ${OTEL_EXPORTER_OTLP_ENDPOINT}."
echo "COPILOT_OTEL_CAPTURE_CONTENT=${COPILOT_OTEL_CAPTURE_CONTENT}"

case "${COPILOT_OTEL_CAPTURE_CONTENT}" in
true | TRUE | 1 | yes | YES)
	echo "Warning: content capture is enabled; prompts, code, paths, or secrets may be emitted." >&2
	;;
esac
