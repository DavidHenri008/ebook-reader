# EPUB Reader

A cloud-hosted EPUB reader built with React, TypeScript, and Vite. Sign in with
Google, choose a Drive folder, and read a curated library in scrolled or
paginated mode.

## Features

- Add existing EPUBs with Google Picker or upload new EPUBs to the selected
  Google Drive folder.
- Section, asset, and table-of-contents extraction via [epubjs](https://github.com/futurepress/epub.js).
- Scrolled and paginated reading modes with zoom and light/dark themes.
- Reading position, preferences, and library metadata are stored in Google Drive.
- Derived extraction output is cached in IndexedDB for faster reopening.
- Installable PWA with app-shell caching only.

## Storage and privacy

Google Drive is the source of truth for books and reader state. The app requests
only the `drive.file` scope, so it can access files it creates or files and
folders explicitly selected through Google Picker. No EPUBs or reader data are
stored on an application-owned server.

EPUB extraction runs in the browser. IndexedDB stores only a derived cache that
can be regenerated from Drive. The service worker caches the application shell,
never EPUB content, Google API responses, Picker responses, or OAuth tokens.

## Tech stack

- React 19 + TypeScript
- Vite 8 with `@vitejs/plugin-react-swc` and `@swc/plugin-emotion`
- Emotion for styling
- TanStack Router for navigation
- `epubjs` for EPUB parsing/rendering
- `idb` for the derived IndexedDB extraction cache
- `vite-plugin-pwa` for the installable, offline app shell

## Getting started

Requires Node.js 20+ and npm.

```bash
npm install      # install dependencies
npm run dev      # start the Vite dev server
```

Configure Google OAuth and Picker credentials as described in
[docs/cloud-deploy.md](docs/cloud-deploy.md), then open the printed local URL.

## Scripts

- `npm run dev` — start the Vite dev server with HMR.
- `npm run build` — type-check (`tsc -b`) and produce a production build.
- `npm run preview` — preview the production build locally.
- `npm run lint` — run ESLint.
- `npm test` — run the Vitest suite once.
- `npm run test:watch` — run Vitest in watch mode.

## Project structure

- `src/pages/` — route-level pages (`HomePage`, `ReaderPage`).
- `src/components/` — UI components, including the `sectionViewer` reader engine.
- `src/services/` — EPUB extraction, metadata, and page estimation.
- `src/reader/` — framework-agnostic reader primitives (shadow host, anchors, pagination).
- `src/storage/` — Drive-backed library/reading state and the local derived cache.
- `src/types/` — shared data contracts.
- `src/utils/` — small shared helpers.
