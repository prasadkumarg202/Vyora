"use client";

import { Button } from "@vyora/ui";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "vyora.theme";
type Theme = "light" | "dark";

/**
 * Light/dark toggle. The design is high-fidelity light; dark is the roadmap's
 * Phase 4 requirement. Preference persists in localStorage and applies the
 * `dark` class to <html>, which is what the token variables key off.
 *
 * The initial class is set by an inline script in the layout (before paint) so
 * there is no flash of the wrong theme; this only handles user toggling.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: the choice just won't persist across reloads.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="text-band-content/90 hover:bg-white/10"
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
