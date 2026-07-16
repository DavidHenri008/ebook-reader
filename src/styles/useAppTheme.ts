import { createContext, useContext } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Theme } from "../types/storage";

export interface AppThemeContextValue {
  theme: Theme;
  setTheme: Dispatch<SetStateAction<Theme>>;
}

export const AppThemeContext = createContext<AppThemeContextValue | null>(null);

/**
 * Reads and updates the global theme owned by `AppThemeProvider`.
 * @returns A `[theme, setTheme]` tuple mirroring `useState`.
 */
export function useAppTheme(): [Theme, Dispatch<SetStateAction<Theme>>] {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within AppThemeProvider.");
  }
  return [context.theme, context.setTheme];
}
