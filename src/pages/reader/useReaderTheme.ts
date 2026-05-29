import { useCallback } from "react";
import { useAppTheme } from "../../styles";
import type { Theme } from "../../types";

/**
 * Reader-page theme control. Wraps {@link useAppTheme} (global theme value plus
 * `data-theme`/`localStorage` side effects) and adds a stable `toggleTheme`.
 *
 * Reader-scoped reading-state no longer persists theme (it is a global library
 * preference), so this hook owns no book-scoped IndexedDB writes.
 */
export function useReaderTheme(initialTheme: Theme) {
  const [theme, setTheme] = useAppTheme(initialTheme);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }, [setTheme]);

  return { theme, toggleTheme };
}
