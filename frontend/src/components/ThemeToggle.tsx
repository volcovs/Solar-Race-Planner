import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { currentTheme, setTheme, type Theme } from "../lib/theme";

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(currentTheme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Sun : Moon;

  function toggle() {
    setTheme(next);
    setThemeState(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="inline-flex size-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
