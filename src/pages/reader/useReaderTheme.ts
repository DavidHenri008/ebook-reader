import { useCallback } from "react";
import { useAppTheme } from "../../styles";

/**
 * Reader-page theme control. Wraps the provider-backed {@link useAppTheme}
 * value and adds a stable `toggleTheme`.
 *
 * Reader-scoped reading-state no longer persists theme (it is a global library
 * preference), so this hook owns no book-scoped IndexedDB writes.
 */
export function useReaderTheme() {
  const [theme, setTheme] = useAppTheme();

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }, [setTheme]);

  return { theme, toggleTheme };
}
