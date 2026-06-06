"use client";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "~/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const current = theme === "system" ? resolvedTheme : theme;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(current === "dark" ? "light" : "dark")}
    >
      {/* Both icons always render; the `.dark` class cross-fades/rotates
          between them in CSS. This avoids the resolvedTheme-conditional render
          (undefined on the server) that previously risked a hydration mismatch. */}
      <span className="relative block h-4 w-4">
        <Moon className="absolute inset-0 h-4 w-4 rotate-0 scale-100 opacity-100 transition-all duration-300 dark:-rotate-90 dark:scale-0 dark:opacity-0" />
        <Sun className="absolute inset-0 h-4 w-4 rotate-90 scale-0 opacity-0 transition-all duration-300 dark:rotate-0 dark:scale-100 dark:opacity-100" />
      </span>
    </Button>
  );
}
