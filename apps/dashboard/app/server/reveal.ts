/**
 * Server function exposing per-span captured content. Only returns data when
 * the captured-content attributes are actually present on the span (i.e. the
 * collector was running with `COPILOT_OTEL_CAPTURE_CONTENT=true` at capture
 * time). Returns empty strings otherwise.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRevealedContent } from "./queries/calls";

export const revealContent = createServerFn({ method: "POST" })
  .inputValidator((d: { spanId: string }) => {
    const parsed = z.object({
      spanId: z.string().min(1),
    }).parse(d);
    if (parsed.spanId.length === 0) {
      throw new Error("spanId required");
    }
    if (!/^[A-Fa-f0-9-]+$/.test(parsed.spanId)) {
      throw new Error("invalid spanId");
    }
    return parsed;
  })
  .handler(async ({ data }) => {
    return getRevealedContent(data.spanId);
  });
