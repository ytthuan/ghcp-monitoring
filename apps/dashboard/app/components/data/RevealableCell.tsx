"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "~/components/ui/button";
import { setRevealActive } from "~/components/layout/RevealBanner";
import { revealContent } from "~/server/reveal";

/**
 * Default-redacted content cell. Click "Reveal" to fetch the full prompt /
 * response from the server function for this span. Setting any cell to
 * revealed flips the session-wide flag that drives <RevealBanner />.
 */
export function RevealableCell({ spanId }: { spanId: string }) {
  const [content, setContent] = useState<{
    input_messages: string;
    output_messages: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!content) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-muted-foreground"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setErr(null);
          try {
            const data = await revealContent({
              data: { spanId },
            });
            setContent(data);
            setRevealActive(true);
          } catch (e) {
            setErr(e instanceof Error ? e.message : "failed");
          } finally {
            setLoading(false);
          }
        }}
      >
        <Eye className="mr-1 h-3 w-3" />
        {loading ? "loading…" : err ? err : "[redacted, click to reveal]"}
      </Button>
    );
  }

  return (
    <div className="max-w-xl space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-mono text-muted-foreground">prompt / response</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6"
          onClick={() => setContent(null)}
        >
          <EyeOff className="mr-1 h-3 w-3" />
          Hide
        </Button>
      </div>
      <details>
        <summary className="cursor-pointer text-muted-foreground">input</summary>
        <pre className="max-h-60 overflow-auto rounded bg-muted p-2">
          {content.input_messages || "(empty)"}
        </pre>
      </details>
      <details>
        <summary className="cursor-pointer text-muted-foreground">output</summary>
        <pre className="max-h-60 overflow-auto rounded bg-muted p-2">
          {content.output_messages || "(empty)"}
        </pre>
      </details>
    </div>
  );
}
