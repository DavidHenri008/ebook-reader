import { css, Global } from "@emotion/react";
import { themeCssVariables } from "./palette";

//#region Global Styles
const globalStyles = css`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  :root {
    /* Light palette (default) */
    ${themeCssVariables("light")}

    /* Overlay and status colors (sit over content, theme-independent) */
    --overlay: rgba(0, 0, 0, 0.4);
    --overlay-strong: rgba(0, 0, 0, 0.6);
    --overlay-weak: rgba(0, 0, 0, 0.25);
    --danger: rgba(220, 38, 38, 0.9);
    --info: rgba(30, 100, 220, 0.9);
  }

  /* System dark preference, only when no explicit theme is set */
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) {
      ${themeCssVariables("dark")}
    }
  }

  /* Explicit dark theme choice */
  html[data-theme="dark"] {
    ${themeCssVariables("dark")}
  }

  html,
  body {
    margin: 0;
    padding: 0;
    height: 100%;
    width: 100%;
  }

  body {
    font-family: system-ui, "Segoe UI", Roboto, sans-serif;
    font-size: 16px;
    line-height: 1.5;
    color: var(--text);
    background: var(--bg);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  #root {
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  button {
    font-family: inherit;
  }
`;
//#endregion

/**
 * Global CSS styles component.
 * Provides base styles, CSS variables for theming, and resets.
 * Should be rendered once at the app root.
 * @returns Global styles component using Emotion's Global
 */
function GlobalStyles() {
  return <Global styles={globalStyles} />;
}

export default GlobalStyles;
