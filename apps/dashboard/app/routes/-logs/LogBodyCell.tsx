/**
 * Per-page cell for log bodies. Redacts by default when the body is long
 * enough to plausibly carry user-authored content (prompts/responses/tool
 * payloads). Errs on the side of redaction; reveal flips the session-wide
 * <RevealBanner /> flag.
 *
 * Heuristic:
 *   - Bodies ≤ REDACT_THRESHOLD chars: shown verbatim (truncated visually).
 *   - Severities ERROR / FATAL / WARN: shown verbatim (operators need them).
 *   - JSON-shaped bodies whose top-level keys do NOT match
 *     /prompt|response|tool/i: shown verbatim.
 *   - Everything else: redacted, click-to-reveal.
 */
import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "~/components/ui/button";
import { setRevealActive } from "~/components/layout/RevealBanner";

export const REDACT_THRESHOLD = 200;

const SAFE_SEVERITIES = new Set(["ERROR", "FATAL", "WARN", "WARNING"]);
// Conservative — any key resembling user-authored content triggers redaction.
const SENSITIVE_KEY_RE =
  /prompt|response|tool|messages?|content|arguments?|results?|completion|input|output/i;

/**
 * Pure decision function — exported for unit-style reasoning + tests.
 * Returns true when the body should be redacted by default.
 */
export function shouldRedactLogBody(body: string, severity: string): boolean {
  if (!body) return false;
  if (body.length <= REDACT_THRESHOLD) return false;
  const sev = (severity || "").toUpperCase();
  if (SAFE_SEVERITIES.has(sev)) return false;
  // Try to recognize a clearly-safe JSON shape.
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const keys = collectKeys(parsed);
      if (keys.length > 0 && !keys.some((k) => SENSITIVE_KEY_RE.test(k))) {
        return false;
      }
    } catch {
      // not JSON — fall through to redact
    }
  }
  return true;
}

function collectKeys(v: unknown, depth = 0): string[] {
  if (depth > 3 || v == null) return [];
  if (Array.isArray(v)) return v.flatMap((x) => collectKeys(x, depth + 1));
  if (typeof v === "object") {
    const keys = Object.keys(v as Record<string, unknown>);
    const nested = Object.values(v as Record<string, unknown>).flatMap((x) =>
      collectKeys(x, depth + 1),
    );
    return [...keys, ...nested];
  }
  return [];
}

export function LogBodyCell({
  body,
  severity,
}: {
  body: string;
  severity: string;
}) {
  const redact = shouldRedactLogBody(body, severity);
  const [revealed, setRevealed] = useState(false);

  if (!body) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (redact && !revealed) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="log-body-redacted"
        className="h-7 px-2 text-xs text-muted-foreground"
        aria-label="Reveal log body"
        onClick={(e) => {
          e.stopPropagation();
          setRevealed(true);
          setRevealActive(true);
        }}
      >
        <Eye className="mr-1 h-3 w-3" aria-hidden />
        [redacted, click to reveal]
      </Button>
    );
  }

  const display = body.length > 240 ? `${body.slice(0, 240)}…` : body;
  return (
    <span
      data-testid={revealed ? "log-body-revealed" : "log-body-plain"}
      title={body}
      className="block max-w-[480px] truncate text-xs"
    >
      {display}
    </span>
  );
}
