"use client";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "~/components/ui/button";

const REVEAL_KEY = "copilot-dashboard.reveal";

export function isRevealActive(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(REVEAL_KEY) === "true";
}

export function setRevealActive(v: boolean): void {
  if (typeof window === "undefined") return;
  if (v) window.sessionStorage.setItem(REVEAL_KEY, "true");
  else window.sessionStorage.removeItem(REVEAL_KEY);
  window.dispatchEvent(new CustomEvent("copilot-reveal-changed"));
}

export function RevealBanner() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const sync = () => setActive(isRevealActive());
    sync();
    window.addEventListener("copilot-reveal-changed", sync);
    return () => window.removeEventListener("copilot-reveal-changed", sync);
  }, []);

  if (!active) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
        <Lock className="h-3.5 w-3.5" />
        Captured prompt/response content is currently revealed in this session.
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        onClick={() => setRevealActive(false)}
      >
        Lock all
      </Button>
    </div>
  );
}
