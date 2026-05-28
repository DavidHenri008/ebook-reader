# Project Guidelines

## Project Context

This is a local-first EPUB reader built with React, TypeScript, Vite, Emotion, React Router, epubjs, idb, and VitePWA. The app imports local EPUB files, extracts sections/assets/TOC, caches raw books in IndexedDB, restores reading state, and renders books in scrolled or paginated modes.

Keep EPUB content local. Do not introduce file uploads, server storage, cloud sync, or remote EPUB processing unless the user explicitly asks for it. The PWA should cache the app shell only, not user EPUB files.

## Architecture

- `src/pages/ReaderPage.tsx` orchestrates extraction/cache loading, TOC navigation, theme, zoom, reading mode, current section, and reading position.
- `src/services/bookExtractor.ts` is the epubjs boundary. Keep epubjs adapter types and extraction-specific logic there when possible.
- `src/services/pageEstimation.ts` owns text/page estimation behavior.
- `src/storage/*` wraps IndexedDB-backed persistence for the library, raw book cache, and reading state.
- `src/components/sectionViewer/*` owns Shadow DOM rendering, anchor tracking, and the scrolled/paginated viewing behavior. Prefer adding viewer-specific DOM logic there instead of growing `ReaderPage.tsx`.
- Shared data contracts live in `src/types/*`; keep service/component changes aligned with those types.

## Code Style

Use function components, React hooks, TypeScript, and Emotion styled components consistent with the existing code. Prefer narrow local types at integration boundaries instead of spreading `any` through the app, especially around epubjs APIs.

Keep changes focused and avoid broad rewrites unless the request requires them. For structured EPUB/HTML data, prefer DOM APIs or narrowly scoped helpers over brittle string manipulation when practical.

## EPUB And Reader Gotchas

- EPUB extraction performance is dominated by serial epubjs spine `item.render()` calls on large fixed-layout books. Preserve visible progress when doing full extraction.
- Cache reload restores IndexedDB `Blob`s in batches of 8 with progress. Do not re-add performance timing instrumentation unless requested.
- Off-screen page measurement must not set images to `loading="lazy"` when awaiting load/error; hidden lazy images can stall total page estimation.
- `SectionViewer` should report wrapper viewport dimensions independently of paginated render completion so `ReaderPage` can start page estimation promptly.
- When rewriting EPUB asset references, preserve src/srcset/href/poster/data/xlink references, CSS `url(...)` references, fragments, and `./` path variants.

## Build And Validation

Use the npm scripts in `package.json`:

- `npm run dev` starts the Vite dev server.
- `npm run build` runs TypeScript project build and Vite production build.
- `npm run lint` runs ESLint.

There is no dedicated test script at the moment, so do not report a test command as available unless one is added.
