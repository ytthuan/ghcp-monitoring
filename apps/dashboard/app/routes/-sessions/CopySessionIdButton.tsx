"use client";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function CopySessionIdButton({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Copy session id"
      data-testid="copy-session-id"
      className={cn("h-7 w-7", FOCUS_RING, className)}
      onClick={async () => {
        try {
          if (
            typeof navigator !== "undefined" &&
            navigator.clipboard?.writeText
          ) {
            await navigator.clipboard.writeText(id);
            toast.success("Session id copied");
          } else {
            toast.error("Clipboard not available");
          }
        } catch {
          toast.error("Couldn't copy session id — try again");
        }
      }}
    >
      <Copy className="h-3.5 w-3.5" aria-hidden />
    </Button>
  );
}
