// The theme lives on <html data-theme>. index.html sets it before the first paint
// (saved choice, else the system setting); this module reads and changes it afterwards.

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "srp-theme"; // also used by the script in index.html

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Apply and remember an explicit choice. Until the user chooses, the system setting wins. */
export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked (private mode); the theme still applies for this visit.
  }
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** The current theme; re-renders when it changes, whoever changes it. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme);
}

/** Value of a CSS colour token (e.g. "--speed-low") in the current theme. */
export function readToken(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}
