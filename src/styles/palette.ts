import type { Theme } from "../types";

/**
 * Single source of truth for theme color values.
 *
 * The global stylesheet derives its `:root` / `[data-theme]` CSS variables from
 * this map, and the reader's shadow host emits literal `--bg/--text/
 * --text-heading/--border` values from the same source (a shadow root cannot
 * inherit page-level CSS variables, so it must restate the literals).
 */
interface ThemePalette {
  bg: string;
  text: string;
  textHeading: string;
  border: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
}

const palettes: Record<Theme, ThemePalette> = {
  light: {
    bg: "#ffffff",
    text: "#6b6375",
    textHeading: "#08060d",
    border: "#e5e4e7",
    accent: "#aa3bff",
    accentBg: "rgba(170, 59, 255, 0.1)",
    accentBorder: "rgba(170, 59, 255, 0.5)",
  },
  dark: {
    bg: "#16171d",
    text: "#9ca3af",
    textHeading: "#f3f4f6",
    border: "#2e303a",
    accent: "#c084fc",
    accentBg: "rgba(192, 132, 252, 0.15)",
    accentBorder: "rgba(192, 132, 252, 0.5)",
  },
};

/**
 * Returns the full set of theme CSS-variable declarations for a `:root` /
 * `[data-theme]` block in the global stylesheet.
 */
export function themeCssVariables(theme: Theme): string {
  const p = palettes[theme];
  return [
    `--text: ${p.text};`,
    `--text-heading: ${p.textHeading};`,
    `--bg: ${p.bg};`,
    `--border: ${p.border};`,
    `--accent: ${p.accent};`,
    `--accent-bg: ${p.accentBg};`,
    `--accent-border: ${p.accentBorder};`,
  ].join("\n    ");
}

/**
 * Returns the literal CSS variable declarations the reader shadow host needs,
 * plus the matching `color-scheme`. Shadow roots cannot inherit page-level CSS
 * variables, so these values are emitted directly into the host style.
 */
export function readerHostCssVariables(theme: Theme): string {
  const p = palettes[theme];
  return `--bg:${p.bg};--text:${p.text};--text-heading:${p.textHeading};--border:${p.border};color-scheme:${theme};`;
}
