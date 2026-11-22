// The theme lives on <html data-theme>. index.html sets it before the first paint
// (saved choice, else the system setting); this module changes it afterwards.

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
