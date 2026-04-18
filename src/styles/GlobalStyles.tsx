import { css, Global } from "@emotion/react";

//#region Global Styles
const globalStyles = css`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  :root {
    --text: #6b6375;
    --text-heading: #08060d;
    --bg: #ffffff;
    --border: #e5e4e7;
    --accent: #aa3bff;
    --accent-bg: rgba(170, 59, 255, 0.1);
    --accent-border: rgba(170, 59, 255, 0.5);

    @media (prefers-color-scheme: dark) {
      --text: #9ca3af;
      --text-heading: #f3f4f6;
      --bg: #16171d;
      --border: #2e303a;
      --accent: #c084fc;
      --accent-bg: rgba(192, 132, 252, 0.15);
      --accent-border: rgba(192, 132, 252, 0.5);
    }
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
export function GlobalStyles() {
  return <Global styles={globalStyles} />;
}
