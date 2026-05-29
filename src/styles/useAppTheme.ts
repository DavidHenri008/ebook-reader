import { useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Theme } from "../types/storage";
import { getCurrentLibraryTheme, THEME_STORAGE_KEY } from "../storage";

/**
 * Owns the app-level theme value and its side effects: it mirrors the current
 * theme onto `document.documentElement.dataset.theme` (so global CSS variables
 * override the system media query) and persists it to `localStorage`.
 *
 * Book-scoped persistence (e.g. `saveReadingState`) is intentionally left to
 * the caller — this hook only manages the global library theme.
 *
 * @param initialTheme - Optional starting theme; defaults to the stored
 *   library theme read from `localStorage`.
 * @returns A `[theme, setTheme]` tuple mirroring `useState`.
 */
export function useAppTheme(
  initialTheme?: Theme,
): [Theme, Dispatch<SetStateAction<Theme>>] {
  const [theme, setTheme] = useState<Theme>(
    () => initialTheme ?? getCurrentLibraryTheme(),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}
