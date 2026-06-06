"use client";
import { useEffect } from "react";

/**
 * Full-viewport decorative aurora that sits behind all app content via -z-10
 * inside AppShell's isolated stacking context. It paints with background-image
 * only, so the computed background-color of <body> (cream) and every card
 * (white) is untouched. The drift animation pauses when the tab is hidden
 * (battery/thermals on an always-on ops screen) and is neutralized entirely
 * under prefers-reduced-motion by the global CSS floor.
 */
export function AuroraBackground() {
  useEffect(() => {
    const sync = () => {
      document.documentElement.setAttribute(
        "data-doc-hidden",
        document.hidden ? "true" : "false",
      );
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return <div aria-hidden className="aurora-layer -z-10" />;
}
