"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", ""]);

export function LanBanner() {
  const [hostname, setHostname] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const h = window.location.hostname;
    // `?lan=force` is an escape hatch so operators (and e2e) can preview the
    // banner from a loopback session — the property `window.location.hostname`
    // is read-only in browsers and can't be reliably shadowed from a test.
    const forced = new URLSearchParams(window.location.search).get("lan") === "force";
    if (forced) {
      setHostname(h || "lan-preview");
      return;
    }
    if (!LOOPBACK_HOSTS.has(h)) setHostname(h);
  }, []);

  if (!hostname || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-2 border-b bg-yellow-100 px-3 py-1 text-xs text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200"
    >
      <span>
        ⚠ This dashboard is reachable on your LAN at{" "}
        <span className="font-medium">{hostname}</span>. Make sure
        DASHBOARD_PASSWORD is rotated.
      </span>
      <button
        type="button"
        aria-label="Dismiss LAN reminder"
        onClick={() => setDismissed(true)}
        className="rounded p-0.5 hover:bg-yellow-200/70 dark:hover:bg-yellow-800/40"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
