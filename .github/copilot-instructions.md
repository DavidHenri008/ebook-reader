# Project Guidelines

## Project Context

This is a cloud-hosted EPUB reader (web app) built with React, TypeScript, Vite, Emotion, TanStack Router, epubjs, idb, and VitePWA. Users sign in with Google (Google Identity Services) and choose a Drive folder to manage books in via the Google Picker. Their library is a curated manifest (`library.json`) of books they add — by picking existing EPUBs via the Google Picker or uploading — not a raw folder listing; removing a book only forgets it (the Drive file is never deleted). The app reads EPUB files from Drive, extracts sections/assets/TOC on the client (cached locally in IndexedDB for fast reopening), restores reading state and preferences from Drive (`settings.json`), and renders books in scrolled or paginated modes.

Google Drive is the single source of truth for user content. Use Google Identity Services for auth with the least-privilege `drive.file` scope only (non-sensitive; never `drive.readonly`/`drive`), plus the Google Picker for granting access to user-chosen files/folder. Do not store user EPUBs on an application-owned server or database. The derived extraction cache is kept in a local IndexedDB cache (persistent, for performance) and regenerated from the Drive EPUB when missing — it is never uploaded to Drive (too large; Drive-quota pressure). The local cache is never authoritative, and there is no offline/local-first library. The PWA caches the app shell only (never user EPUBs or Drive/token responses).

## Architecture

- `src/pages/ReaderPage.tsx` is the page-level coordinator that wires reader hooks and components together (TOC navigation, theme, zoom, reading mode, current section, reading position).
- `src/pages/reader/*` holds the reader orchestration hooks: `useBookExtraction` (cache-then-extract pipeline), `usePageMap` (measurement/invalidation), `useReaderPersistence` (reading-state saves), and `useReaderTheme`.
- `src/components/reader/*` holds presentational reader UI (`ReaderToolbar`, `ReaderSidebar`, `TocList`).
- `src/services/bookExtractor.ts` is the epubjs boundary. Keep epubjs adapter types and extraction-specific logic there when possible.
- `src/services/pageEstimation.ts` owns text/page estimation behavior.
- `src/reader/*` holds framework-agnostic reader primitives (`shadowHost.ts`, `anchor.ts`, `paginated.ts`) shared by both the `sectionViewer` component and the `pageEstimation` service. Keep `services` depending downward into `src/reader/*` rather than importing from `src/components/*`.
- `src/storage/*` wraps Drive-backed persistence for the library, EPUB bytes, and reading state (Google Drive is the source of truth), plus a local IndexedDB cache of the derived extraction output (`bookCache.ts`). The extraction cache persists across sessions for fast reopening and is regenerated from the Drive EPUB on a cache miss; it is never uploaded to Drive.
- `src/components/sectionViewer/*` owns Shadow DOM rendering, anchor tracking, and the scrolled/paginated viewing behavior. Prefer adding viewer-specific DOM logic there instead of growing `ReaderPage.tsx`.
- `src/utils/*` holds small shared helpers (e.g. `htmlText.ts` `getPlainTextLength`, `readingLocation.ts` normalizers, `htmlReferences.ts`).
- Shared data contracts live in `src/types/*`; keep service/component changes aligned with those types.

## Code Style

Use function components, React hooks, TypeScript, and Emotion styled components consistent with the existing code. Prefer narrow local types at integration boundaries instead of spreading `any` through the app, especially around epubjs APIs.

Keep changes focused and avoid broad rewrites unless the request requires them. For structured EPUB/HTML data, prefer DOM APIs or narrowly scoped helpers over brittle string manipulation when practical.

## EPUB And Reader Gotchas

- EPUB extraction performance is dominated by serial epubjs spine `item.render()` calls on large fixed-layout books. Preserve visible progress when doing full extraction.
- Book loading checks the IndexedDB extraction cache first; on a hit it restores cached sections in batches with visible progress, and on a miss it downloads EPUB bytes from Drive, extracts, then caches the result. Do not re-add performance timing instrumentation unless requested.
- Off-screen page measurement must not set images to `loading="lazy"` when awaiting load/error; hidden lazy images can stall total page estimation.
- `SectionViewer` should report wrapper viewport dimensions independently of paginated render completion so `ReaderPage` can start page estimation promptly.
- When rewriting EPUB asset references, preserve src/srcset/href/poster/data/xlink references, CSS `url(...)` references, fragments, and `./` path variants. `collectAssetReferences` in `src/services/bookExtractor.ts` does this via a `DOMParser` pass; its exact output set is pinned by `bookExtractor.test.ts` (unit) and `bookExtractor.integration.test.ts` (real EPUB), so keep those green when changing it.

## Build And Validation

Use the npm scripts in `package.json`:

- `npm run dev` starts the Vite dev server.
- `npm run build` runs TypeScript project build and Vite production build.
- `npm run lint` runs ESLint.
- `npm test` runs the Vitest suite once; `npm run test:watch` runs it in watch mode.

Tests use Vitest + jsdom (config in `vitest.config.ts`). Do not run full `extractRawBook` in tests: epubjs spine rendering under jsdom times out regardless of book size. Integration tests instead unzip the fixture (`SMALL.epub`) with JSZip and run `collectAssetReferences` over the real section XHTML.
