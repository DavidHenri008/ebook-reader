import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { getCurrentLibraryTheme, THEME_STORAGE_KEY } from "../storage";
import type { Theme } from "../types";
import { getThemePalette } from "./palette";
import { AppThemeContext } from "./useAppTheme";

interface AppThemeProviderProps {
  children: ReactNode;
}

function AppThemeProvider({ children }: AppThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(getCurrentLibraryTheme);
  const colors = getThemePalette(theme);
  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: theme,
          background: { default: colors.bg, paper: colors.bg },
          text: { primary: colors.textHeading, secondary: colors.text },
          primary: { main: colors.accent },
          divider: colors.border,
          action: {
            hover: colors.accentBg,
            selected: colors.accentBg,
            disabled: colors.text,
            disabledBackground: colors.border,
          },
        },
        shape: { borderRadius: 8 },
        typography: {
          fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
          button: { textTransform: "none", fontWeight: 500 },
        },
        components: {
          MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: {
              root: { minHeight: "2.5rem" },
              outlined: { borderColor: colors.border },
            },
          },
          MuiIconButton: {
            styleOverrides: {
              root: {
                color: colors.text,
                "&:hover": {
                  backgroundColor: colors.accentBg,
                  color: colors.accent,
                },
              },
            },
          },
          MuiListItemIcon: {
            styleOverrides: { root: { color: "inherit" } },
          },
          MuiPaper: {
            styleOverrides: { root: { backgroundImage: "none" } },
          },
          MuiToggleButton: {
            styleOverrides: {
              root: {
                borderColor: colors.border,
                color: colors.text,
                textTransform: "none",
                "&.Mui-selected": {
                  backgroundColor: colors.accentBg,
                  color: colors.accent,
                },
              },
            },
          },
        },
      }),
    [colors, theme],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const contextValue = useMemo(() => ({ theme, setTheme }), [theme]);

  return (
    <AppThemeContext.Provider value={contextValue}>
      <ThemeProvider theme={muiTheme}>{children}</ThemeProvider>
    </AppThemeContext.Provider>
  );
}

export default AppThemeProvider;
