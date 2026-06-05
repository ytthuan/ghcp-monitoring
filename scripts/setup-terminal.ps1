[CmdletBinding()]
param(
    [switch]$EnableContentCapture
)

$env:COPILOT_OTEL_ENABLED = "true"
$env:OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:4318"
$env:OTEL_EXPORTER_OTLP_PROTOCOL = "http/protobuf"

if ([string]::IsNullOrWhiteSpace($env:OTEL_SERVICE_NAME)) {
    $env:OTEL_SERVICE_NAME = "github-copilot"
}

if ($EnableContentCapture) {
    $env:COPILOT_OTEL_CAPTURE_CONTENT = "true"
}
elseif ([string]::IsNullOrWhiteSpace($env:COPILOT_OTEL_CAPTURE_CONTENT)) {
    $env:COPILOT_OTEL_CAPTURE_CONTENT = "false"
}

Write-Host "Copilot CLI telemetry configured for OTLP HTTP at $($env:OTEL_EXPORTER_OTLP_ENDPOINT)."
Write-Host "COPILOT_OTEL_CAPTURE_CONTENT=$($env:COPILOT_OTEL_CAPTURE_CONTENT)"

if ($env:COPILOT_OTEL_CAPTURE_CONTENT -match "^(?i:true|1|yes)$") {
    Write-Warning "Content capture is enabled; prompts, code, paths, or secrets may be emitted."
}
