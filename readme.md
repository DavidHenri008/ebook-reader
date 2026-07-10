# EPUB Reader

A local-first EPUB reader built with React, TypeScript, and Vite. Import EPUB
files from your device, read them in scrolled or paginated mode, and keep your
library and reading position entirely on your own machine.

## Features

- Import local `.epub` files — nothing is uploaded to a server.
- Section, asset, and table-of-contents extraction via [epubjs](https://github.com/futurepress/epub.js).
- Scrolled and paginated reading modes with zoom and light/dark themes.
- Reading position is restored per book, including the current section and anchor.
- Raw books are cached in IndexedDB so reopening is fast and works offline.
- Installable PWA: the app shell is cached for offline use; your EPUB files are not.

## Local-first by design

Books stay on the device. There is no file upload, server storage, cloud sync,
or remote EPUB processing. The service worker caches only the application shell
(JS, CSS, HTML, icons), never user EPUB content.

## Tech stack

- React 19 + TypeScript
- Vite 8 with `@vitejs/plugin-react-swc` and `@swc/plugin-emotion`
- Emotion for styling
- React Router for navigation
- `epubjs` for EPUB parsing/rendering
- `idb` for IndexedDB-backed persistence
- `vite-plugin-pwa` for the installable, offline app shell

## Getting started

Requires Node.js 20+ and npm.

```bash
npm install      # install dependencies
npm run dev      # start the Vite dev server
```

Then open the printed local URL and import an EPUB to start reading.

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
- `src/storage/` — IndexedDB wrappers for the library, raw book cache, and reading state.
- `src/types/` — shared data contracts.
- `src/utils/` — small shared helpers.

## Installation
How to use it on your PC without manually starting a server each time:

- Run once:
    `npm install`
    `npm run build`
    `npm run preview`
- Open the shown localhost URL in Chrome or Edge.
- Install the app (browser menu: Install app / Apps > Install this site as an app).
- Launch the installed app from Start menu afterward.
- After install, it can run offline from cache for normal use.
- If you want a true standalone app that never depends on browser/PWA behavior, the next step is packaging as a desktop app (Electron or Tauri).